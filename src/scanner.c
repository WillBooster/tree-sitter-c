#include "conditionalMacro.h"
#include "gnuRawString.h"
#include "emptyDirectives.h"

typedef struct {
    EmptyDirectives directives;
    MacroProofMemo proof_memo;
} CScanner;

enum TokenType { PRAGMA_OPERATOR, PREPROC_ARG, PREPROC_NEWLINE, PREPROC_LPAREN, PREPROC_DIRECTIVE_ARG, PREPROC_FUNCTION_NAME, FUNCTION_ATTRIBUTE_START, POST_TYPE_FUNCTION_ATTRIBUTE_START, POST_TYPE_FUNCTION_ATTRIBUTE_SUFFIX, TRAILING_MACRO_ATTRIBUTE_NAME, TRAILING_OBJECT_DECLARATION_START, CONDITIONAL_MARKER_IFDEF, CONDITIONAL_MARKER_IFNDEF, LEADING_CONDITIONAL_MARKER_IFDEF, LEADING_CONDITIONAL_MARKER_IFNDEF, GNU_RAW_STRING_BODY, RAW_MACRO_TYPE_TAIL, BRACED_FUNCTION_ATTRIBUTE_START, BRACED_MACRO_TYPE_START, DIRECTIVE_CONTEXT, PREPROC_EMPTY, PREPROC_DIRECTIVE_START };

static EmptyDirectives *scanner_directives(CScanner *scanner);

static bool only_extras_valid(const EmptyDirectives *state, const bool *valid_symbols);
static bool scan_extras(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols);
static bool scan_extras_pragma(EmptyDirectives *state, TSLexer *lexer, const TSLexerCheckpoint *start, bool skipped);
static uint32_t extras_start_byte(TSLexer *lexer, const TSLexerCheckpoint *start, bool skipped);
static bool scan_preproc_tokens(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols);
static bool scan_declaration_tokens(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols);
static bool scan_directive_context(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols);
static bool scan_conditional_directive(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols);

void *tree_sitter_c_external_scanner_create(void) {
    return calloc(1, sizeof(CScanner));
}

void tree_sitter_c_external_scanner_destroy(void *payload) {
    CScanner *scanner = payload;
    EmptyDirectives *state = scanner_directives(scanner);
    if (!state) return;
    free(state->starts);
    free(state->ends);
    free(state->line_ends);
    free(state->directive_starts);
    free(state->directive_ends);
    macro_proof_destroy(&scanner->proof_memo);
    free(scanner);
}

unsigned tree_sitter_c_external_scanner_serialize(void *payload, char *buffer) {
    const EmptyDirectives *state = scanner_directives(payload);
    buffer[0] = state && state->ready;
    return 1;
}

void tree_sitter_c_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    CScanner *scanner = payload;
    EmptyDirectives *state = scanner_directives(scanner);
    if (state) state->ready = length && buffer[0];
}

// code-gauge-allow functionCognitiveComplexity 16 -- External-token validity dispatches each lexing mode to its scanner.
bool tree_sitter_c_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    CScanner *scanner = payload;
    EmptyDirectives *state = scanner_directives(scanner);
    if (only_extras_valid(state, valid_symbols)) return scan_extras(state, lexer, valid_symbols);
    if (scan_directive_context(state, lexer, valid_symbols)) return true;
    if (empty_directives_at_line_end(state, lexer)) return false;
    if (valid_symbols[GNU_RAW_STRING_BODY] && !valid_symbols[PREPROC_LPAREN]) {
        lexer->result_symbol = GNU_RAW_STRING_BODY;
        return scan_gnu_raw_string_token(lexer);
    }
    if (valid_symbols[RAW_MACRO_TYPE_TAIL] && !valid_symbols[PREPROC_LPAREN]) {
        lexer->result_symbol = RAW_MACRO_TYPE_TAIL;
        return scan_raw_macro_type_tail(lexer, &(PragmaTrivia){empty_directives_skip, state});
    }
    if (valid_symbols[PREPROC_FUNCTION_NAME] && !valid_symbols[PREPROC_LPAREN]) {
        lexer->result_symbol = PREPROC_FUNCTION_NAME;
        return scan_function_macro_name(lexer, valid_symbols[PRAGMA_OPERATOR], PRAGMA_OPERATOR);
    }
    if (valid_symbols[PREPROC_LPAREN] || valid_symbols[PREPROC_NEWLINE] ||
        valid_symbols[PREPROC_ARG] || valid_symbols[PREPROC_DIRECTIVE_ARG]) {
        return scan_preproc_tokens(state, lexer, valid_symbols);
    }
    bool leading = valid_symbols[LEADING_CONDITIONAL_MARKER_IFDEF] || valid_symbols[LEADING_CONDITIONAL_MARKER_IFNDEF];
    bool conditional = leading || valid_symbols[CONDITIONAL_MARKER_IFDEF] || valid_symbols[CONDITIONAL_MARKER_IFNDEF];
    if (!conditional) return scan_declaration_tokens(scanner, lexer, valid_symbols);
    while (pragma_space(lexer->lookahead)) lexer->advance(lexer, true);
    if (lexer->lookahead == '#') return scan_conditional_directive(state, lexer, valid_symbols);
    return scan_declaration_tokens(scanner, lexer, valid_symbols);
}

static bool only_extras_valid(const EmptyDirectives *state, const bool *valid_symbols) {
    return state && state->ready && !valid_symbols[PREPROC_DIRECTIVE_START] &&
        !memchr(valid_symbols + PREPROC_ARG, true, (DIRECTIVE_CONTEXT - PREPROC_ARG) * sizeof(*valid_symbols));
}

// `starts` marks only `#`, `\`, and spaces/splices before a null directive's `#`, and `line_ends` marks only spaces and
// newlines, so `extras_start_byte` restores the pre-space checkpoint via `mark_end_at` only after `#`/`\` (when `starts`
// exists) or `_Pragma` (when skipped spaces may start at `line_ends`), avoiding checkpoint/column work on other tokens.
static bool scan_extras(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols) {
    bool allow_empty = valid_symbols[PREPROC_EMPTY] && state->starts;
    bool allow_pragma = valid_symbols[PRAGMA_OPERATOR];
    if (!allow_empty && !allow_pragma) return false;
    bool skipped = pragma_space(lexer->lookahead);
    TSLexerCheckpoint start = {0};
    if (skipped && (allow_empty || state->line_ends)) lexer->get_checkpoint(lexer, &start);
    while (pragma_space(lexer->lookahead)) lexer->advance(lexer, true);
    int32_t c = lexer->lookahead;
    if (c == '_') return allow_pragma && scan_extras_pragma(state, lexer, &start, skipped);
    if (!allow_empty || (c != '#' && c != '\\')) return false;
    if (!empty_directives_start_at(state, extras_start_byte(lexer, &start, skipped))) return false;
    empty_directives_consume_started(lexer, state, true);
    lexer->mark_end(lexer);
    lexer->result_symbol = PREPROC_EMPTY;
    return true;
}

static bool scan_extras_pragma(EmptyDirectives *state, TSLexer *lexer, const TSLexerCheckpoint *start, bool skipped) {
    if (!scan_pragma_word(lexer)) return false;
    if (skipped && state->line_ends && empty_directives_line_end_at(state, extras_start_byte(lexer, start, true))) {
        return false;
    }
    lexer->result_symbol = PRAGMA_OPERATOR;
    return scan_pragma_suffix_end_with(lexer, true, &(PragmaTrivia){empty_directives_skip, state});
}

static uint32_t extras_start_byte(TSLexer *lexer, const TSLexerCheckpoint *start, bool skipped) {
    TSLexerPosition position;
    if (skipped) {
        lexer->mark_end_at(lexer, start);
        lexer->get_mark_end(lexer, &position);
    } else {
        lexer->get_position(lexer, &position);
    }
    return position.bytes;
}

static bool scan_conditional_directive(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols) {
    if (!empty_directives_at_start(state, lexer)) return false;
    const ConditionalMacroSymbols symbols = {
        .ifdef = CONDITIONAL_MARKER_IFDEF, .ifndef = CONDITIONAL_MARKER_IFNDEF,
        .leading_ifdef = LEADING_CONDITIONAL_MARKER_IFDEF, .leading_ifndef = LEADING_CONDITIONAL_MARKER_IFNDEF,
        .skip_empty = empty_directives_skip, .empty_context = state,
    };
    return scan_conditional_macro(lexer, &symbols, valid_symbols);
}

static bool scan_directive_context(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols) {
    if (state && !state->ready && valid_symbols[DIRECTIVE_CONTEXT]) {
        lexer->result_symbol = DIRECTIVE_CONTEXT;
        return empty_directives_initialize(state, lexer);
    }
    if (valid_symbols[PREPROC_DIRECTIVE_START] && empty_directives_after_keyword(state, lexer)) {
        lexer->result_symbol = PREPROC_DIRECTIVE_START;
        lexer->mark_end(lexer);
        return true;
    }
    bool directive_body = valid_symbols[PREPROC_NEWLINE] || valid_symbols[PREPROC_LPAREN] ||
        valid_symbols[PREPROC_ARG] || valid_symbols[PREPROC_DIRECTIVE_ARG] || valid_symbols[GNU_RAW_STRING_BODY];
    bool macro_name = valid_symbols[PREPROC_FUNCTION_NAME] && !valid_symbols[PREPROC_LPAREN];
    if (valid_symbols[PREPROC_EMPTY] && !macro_name && (!directive_body || lexer->lookahead == '#') &&
        empty_directives_consume(lexer, state, true)) {
        lexer->mark_end(lexer);
        lexer->result_symbol = PREPROC_EMPTY;
        return true;
    }
    return false;
}

static bool scan_declaration_tokens(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
    EmptyDirectives *state = scanner_directives(scanner);
    static const TSSymbol attribute_tokens[] = {
        FUNCTION_ATTRIBUTE_START, POST_TYPE_FUNCTION_ATTRIBUTE_SUFFIX, POST_TYPE_FUNCTION_ATTRIBUTE_START,
        TRAILING_MACRO_ATTRIBUTE_NAME, TRAILING_OBJECT_DECLARATION_START, BRACED_FUNCTION_ATTRIBUTE_START,
    };
    const MacroAttributeSymbols symbols = {
        .trivia = {empty_directives_skip, state},
        .proof_memo = scanner ? &scanner->proof_memo : NULL,
        .pragma = PRAGMA_OPERATOR,
        .object_start = TRAILING_OBJECT_DECLARATION_START,
        .allow_pragma = valid_symbols[PRAGMA_OPERATOR],
        .allow_object_start = valid_symbols[TRAILING_OBJECT_DECLARATION_START],
        .braced_start = BRACED_FUNCTION_ATTRIBUTE_START,
        .allow_braced_start = valid_symbols[BRACED_FUNCTION_ATTRIBUTE_START],
    };
    if (valid_symbols[BRACED_MACRO_TYPE_START]) {
        lexer->result_symbol = BRACED_MACRO_TYPE_START;
        return scan_braced_macro_type_start(lexer, &symbols, NULL, 0);
    }
    for (unsigned i = 0; i < sizeof(attribute_tokens) / sizeof(attribute_tokens[0]); i++) {
        TSSymbol token = attribute_tokens[i];
        if (!valid_symbols[token]) continue;
        lexer->result_symbol = token;
        return scan_function_attribute_guard(lexer,
            token == FUNCTION_ATTRIBUTE_START || token == POST_TYPE_FUNCTION_ATTRIBUTE_START,
            token != FUNCTION_ATTRIBUTE_START, token == TRAILING_MACRO_ATTRIBUTE_NAME, &symbols);
    }
    return scan_preproc_tokens(state, lexer, valid_symbols);
}

// code-gauge-allow functionCognitiveComplexity 28 -- External-token validity selects one preprocessor lexing mode and preserves its token range.
// code-gauge-allow functionNcss 34 -- External-token validity selects one preprocessor lexing mode and preserves its token range.
static bool scan_preproc_tokens(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols) {
    bool directive_text = !valid_symbols[PREPROC_ARG] && valid_symbols[PREPROC_DIRECTIVE_ARG];
    PreprocArgumentMode argument_mode = preproc_argument_mode(
        valid_symbols[PREPROC_ARG], valid_symbols[PREPROC_DIRECTIVE_ARG], valid_symbols[PREPROC_LPAREN]);
    TSSymbol argument_symbol = directive_text ? PREPROC_DIRECTIVE_ARG : PREPROC_ARG;
    bool argument_valid = valid_symbols[PREPROC_ARG] || directive_text;
    while (valid_symbols[PREPROC_LPAREN] && lexer->lookahead == '\\') {
        lexer->advance(lexer, true);
        if (!scan_preproc_newline(lexer, true)) return false;
    }
    if (valid_symbols[PREPROC_LPAREN] && lexer->lookahead == '(') {
        lexer->advance(lexer, false);
        lexer->mark_end(lexer);
        lexer->result_symbol = PREPROC_LPAREN;
        return true;
    }
    if (valid_symbols[PREPROC_NEWLINE]) {
        for (;;) {
            while (pragma_space(lexer->lookahead) && lexer->lookahead != '\n' && lexer->lookahead != '\r') {
                lexer->advance(lexer, true);
            }
            if (lexer->lookahead != '\\') break;
            lexer->advance(lexer, false);
            lexer->mark_end(lexer);
            if (!scan_preproc_newline(lexer, true)) {
                lexer->result_symbol = argument_symbol;
                return argument_valid && scan_preproc_arg(lexer, true, argument_mode);
            }
        }
        if (lexer->eof(lexer) || scan_preproc_newline(lexer, false)) {
            lexer->mark_end(lexer);
            lexer->result_symbol = PREPROC_NEWLINE;
            return true;
        }
    }
    if (argument_valid) {
        lexer->result_symbol = argument_symbol;
        return scan_preproc_arg(lexer, false, argument_mode);
    }
    lexer->result_symbol = PRAGMA_OPERATOR;
    return valid_symbols[PRAGMA_OPERATOR] && scan_pragma_with(lexer, &(PragmaTrivia){empty_directives_skip, state});
}

static EmptyDirectives *scanner_directives(CScanner *scanner) {
    return scanner ? &scanner->directives : NULL;
}
