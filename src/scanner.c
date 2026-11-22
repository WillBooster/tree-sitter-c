#include "conditionalMacro.h"
#include "gnuRawString.h"
#include "emptyDirectives.h"

typedef struct {
    EmptyDirectives directives;
    MacroProofMemo proof_memo;
} CScanner;

enum TokenType {
    PRAGMA_OPERATOR,
    PREPROC_ARG,
    PREPROC_NEWLINE,
    PREPROC_LPAREN,
    PREPROC_DIRECTIVE_ARG,
    PREPROC_FUNCTION_NAME,
    FUNCTION_ATTRIBUTE_START,
    POST_TYPE_FUNCTION_ATTRIBUTE_START,
    POST_TYPE_FUNCTION_ATTRIBUTE_SUFFIX,
    TRAILING_MACRO_ATTRIBUTE_NAME,
    TRAILING_OBJECT_DECLARATION_START,
    CONDITIONAL_MARKER_IFDEF,
    CONDITIONAL_MARKER_IFNDEF,
    LEADING_CONDITIONAL_MARKER_IFDEF,
    LEADING_CONDITIONAL_MARKER_IFNDEF,
    GNU_RAW_STRING_BODY,
    RAW_MACRO_TYPE_TAIL,
    BRACED_FUNCTION_ATTRIBUTE_START,
    BRACED_MACRO_TYPE_START,
    DIRECTIVE_CONTEXT,
    PREPROC_EMPTY,
    PREPROC_INCLUDE,
    PREPROC_DEFINE,
    PREPROC_IF,
    PREPROC_IFDEF,
    PREPROC_IFNDEF,
    PREPROC_ELSE,
    PREPROC_ELIF,
    PREPROC_ELIFDEF,
    PREPROC_ELIFNDEF,
    PREPROC_ENDIF,
    PREPROC_PRAGMA,
    PREPROC_DIRECTIVE,
    TOKEN_COUNT
};

static const PreprocDirectiveSymbols directive_symbols = {
    .include = PREPROC_INCLUDE,
    .define = PREPROC_DEFINE,
    .preproc_if = PREPROC_IF,
    .ifdef = PREPROC_IFDEF,
    .ifndef = PREPROC_IFNDEF,
    .preproc_else = PREPROC_ELSE,
    .elif = PREPROC_ELIF,
    .elifdef = PREPROC_ELIFDEF,
    .elifndef = PREPROC_ELIFNDEF,
    .endif = PREPROC_ENDIF,
    .pragma = PREPROC_PRAGMA,
    .directive = PREPROC_DIRECTIVE,
};

#if defined(__GNUC__) || defined(__clang__)
#define SCANNER_NOINLINE __attribute__((noinline))
#else
#define SCANNER_NOINLINE
#endif

static inline bool can_start_spaced_c_token(uint32_t c, const EmptyDirectives *state, const bool *valid_symbols);
static SCANNER_NOINLINE bool scan_c_token_spaced_fast(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols);
static SCANNER_NOINLINE bool scan_c_token_slow(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols);
static EmptyDirectives *scanner_directives(CScanner *scanner);
static bool in_error_recovery(const bool *valid_symbols);
static inline bool any_preproc_body_valid(const bool *valid_symbols);
static inline bool any_attribute_valid(const bool *valid_symbols);
static bool only_extras_valid(const EmptyDirectives *state, const bool *valid_symbols);
static bool scan_extras(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols);
static bool scan_empty_directive_extra(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols, bool error_recovery);
static bool scan_error_recovery_tokens(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols);
static bool scan_active_tokens(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols);
static bool scan_non_declaration_tokens(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols);
static bool scan_hash_directive(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols, bool error_recovery);
static bool scan_declaration_tokens(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols, bool consumed_backslash);
static bool scan_preproc_tokens(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols);
static bool is_c_space(int32_t c);
static bool starts_macro_scan(int32_t c, bool consumed_backslash);

void *tree_sitter_c_external_scanner_create(void) {
    return calloc(1, sizeof(CScanner));
}

void tree_sitter_c_external_scanner_destroy(void *payload) {
    CScanner *scanner = payload;
    EmptyDirectives *state = scanner_directives(scanner);
    if (!state) return;
    empty_directives_release(state);
    macro_proof_destroy(&scanner->proof_memo);
    free(scanner);
}

enum { SERIALIZED_READY = 1, SERIALIZED_ANCHORED = 2 };

unsigned tree_sitter_c_external_scanner_serialize(void *payload, char *buffer) {
    const EmptyDirectives *state = scanner_directives(payload);
    buffer[0] = state ? (state->ready ? SERIALIZED_READY : 0) | (state->anchored ? SERIALIZED_ANCHORED : 0) : 0;
    return 1;
}

void tree_sitter_c_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    CScanner *scanner = payload;
    EmptyDirectives *state = scanner_directives(scanner);
    if (!state) return;
    state->ready = length && (buffer[0] & SERIALIZED_READY);
    state->anchored = length && (buffer[0] & SERIALIZED_ANCHORED);
}

bool tree_sitter_c_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    CScanner *scanner = payload;
    EmptyDirectives *state = scanner_directives(scanner);
    int32_t look = lexer->lookahead;
    if (look > 0 && look < 0x80 && look != '\\' && state && state->ready && !state->starts && !state->failed &&
        !any_preproc_body_valid(valid_symbols)) {
        if (look == ' ' || (uint32_t)(look - '\t') < 5) {
            return scan_c_token_spaced_fast(scanner, lexer, valid_symbols);
        }
        if (!can_start_spaced_c_token((uint32_t)look, state, valid_symbols)) return false;
    }
    return scan_c_token_slow(scanner, lexer, valid_symbols);
}

static inline bool can_start_spaced_c_token(uint32_t c, const EmptyDirectives *state, const bool *valid_symbols) {
    if (c == '#') return state->directive_starts.count > 0;
    if (c == '[') return valid_symbols[BRACED_MACRO_TYPE_START];
    if (!((preproc_identifier_start_ascii[c / 64] >> (c % 64)) & 1)) return false;
    return any_attribute_valid(valid_symbols) || valid_symbols[BRACED_MACRO_TYPE_START] ||
        (valid_symbols[TRAILING_OBJECT_DECLARATION_START] && peek_object_starter((uint16_t)c)) ||
        (c == '_' && valid_symbols[PRAGMA_OPERATOR] && state->pragmas);
}

static SCANNER_NOINLINE bool scan_c_token_spaced_fast(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
    int32_t peeked = peek_after_ascii_spaces(lexer);
    if (peeked > 0 && !can_start_spaced_c_token((uint32_t)peeked, &scanner->directives, valid_symbols)) return false;
    return scan_c_token_slow(scanner, lexer, valid_symbols);
}

static SCANNER_NOINLINE bool scan_c_token_slow(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
    EmptyDirectives *state = scanner_directives(scanner);
    if (only_extras_valid(state, valid_symbols)) return scan_extras(scanner, lexer, valid_symbols);
    if (state && !state->ready && valid_symbols[DIRECTIVE_CONTEXT]) return empty_directives_initialize(state, lexer, DIRECTIVE_CONTEXT);
    bool error_recovery = in_error_recovery(valid_symbols);
    if (scan_empty_directive_extra(state, lexer, valid_symbols, error_recovery)) return true;
    return error_recovery
        ? scan_error_recovery_tokens(state, lexer, valid_symbols)
        : scan_active_tokens(scanner, lexer, valid_symbols);
}

static bool scan_error_recovery_tokens(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols) {
    bool consumed_backslash = false;
    skip_leading_spaces_and_splices(lexer, is_c_space, NULL, &consumed_backslash);
    if (!consumed_backslash && lexer->lookahead == '#') return scan_hash_directive(state, lexer, valid_symbols, true);
    lexer->result_symbol = PRAGMA_OPERATOR;
    return !consumed_backslash && valid_symbols[PRAGMA_OPERATOR] && empty_directives_pragma_possible(state) &&
        scan_pragma_with(lexer, &(PragmaTrivia){empty_directives_skip, state});
}

static bool scan_active_tokens(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
    EmptyDirectives *state = scanner_directives(scanner);
    if (empty_directives_at_line_end(state, lexer)) return false;
    if (any_preproc_body_valid(valid_symbols)) return scan_non_declaration_tokens(state, lexer, valid_symbols);
    int32_t peeked = peek_after_ascii_spaces(lexer);
    if (peeked >= 0) {
        bool ident = starts_macro_scan(peeked, false) &&
            (any_attribute_valid(valid_symbols) || valid_symbols[BRACED_MACRO_TYPE_START] ||
             (valid_symbols[TRAILING_OBJECT_DECLARATION_START] && peek_object_starter((uint16_t)peeked)) ||
             (peeked == '_' && valid_symbols[PRAGMA_OPERATOR] && empty_directives_pragma_possible(state)));
        if (!ident && !(peeked == '#' && empty_directives_has_directives(state)) &&
            !(peeked == '[' && valid_symbols[BRACED_MACRO_TYPE_START])) {
            return false;
        }
    }
    bool consumed_backslash = false;
    skip_leading_spaces_and_splices(lexer, is_c_space, NULL, &consumed_backslash);
    if (!consumed_backslash && lexer->lookahead == '#') return scan_hash_directive(state, lexer, valid_symbols, false);
    return scan_declaration_tokens(scanner, lexer, valid_symbols, consumed_backslash);
}

static inline bool any_preproc_body_valid(const bool *valid_symbols) {
    _Static_assert(PREPROC_FUNCTION_NAME - PREPROC_ARG == 4 && RAW_MACRO_TYPE_TAIL - GNU_RAW_STRING_BODY == 1,
        "preproc body tokens are contiguous");
    uint64_t head = 0;
    uint16_t raw = 0;
    memcpy(&head, valid_symbols + PREPROC_ARG, 5);
    memcpy(&raw, valid_symbols + GNU_RAW_STRING_BODY, 2);
    return (head | raw) != 0;
}

static inline bool any_attribute_valid(const bool *valid_symbols) {
    _Static_assert(TRAILING_MACRO_ATTRIBUTE_NAME - FUNCTION_ATTRIBUTE_START == 3,
        "attribute tokens are contiguous");
    uint32_t bits = 0;
    memcpy(&bits, valid_symbols + FUNCTION_ATTRIBUTE_START, 4);
    return bits != 0 || valid_symbols[BRACED_FUNCTION_ATTRIBUTE_START];
}

static bool in_error_recovery(const bool *valid_symbols) {
    return valid_symbols[GNU_RAW_STRING_BODY] && valid_symbols[RAW_MACRO_TYPE_TAIL];
}

static bool only_extras_valid(const EmptyDirectives *state, const bool *valid_symbols) {
    static const uint8_t extras[24] = {
        [PRAGMA_OPERATOR] = 0xff,
        [TRAILING_OBJECT_DECLARATION_START] = 0xff,
        [CONDITIONAL_MARKER_IFDEF] = 0xff, [CONDITIONAL_MARKER_IFNDEF] = 0xff,
        [LEADING_CONDITIONAL_MARKER_IFDEF] = 0xff, [LEADING_CONDITIONAL_MARKER_IFNDEF] = 0xff,
        [DIRECTIVE_CONTEXT] = 0xff, [PREPROC_EMPTY] = 0xff,
        [PREPROC_INCLUDE] = 0xff, [PREPROC_DEFINE] = 0xff, [PREPROC_IF] = 0xff,
    };
    _Static_assert(DIRECTIVE_CONTEXT == 19 && TOKEN_COUNT == 33, "trailing tokens are all extras");
    return state && state->ready && empty_directives_only_valid(valid_symbols, extras, sizeof extras);
}

// Fails without consuming a character unless a directive, pragma, or object-declaration guard can start here, since
// the lexer rereads from the start what a failed scan consumed.
static bool scan_extras(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
    EmptyDirectives *state = scanner_directives(scanner);
    if (valid_symbols[PREPROC_EMPTY] && empty_directives_consume(lexer, state, true)) {
        lexer->mark_end(lexer);
        lexer->result_symbol = PREPROC_EMPTY;
        return true;
    }
    bool allow_directive = empty_directives_has_directives(state);
    bool allow_object = valid_symbols[TRAILING_OBJECT_DECLARATION_START];
    bool allow_pragma = valid_symbols[PRAGMA_OPERATOR] && state->pragmas;
    PeekExtrasKind kind = peek_extras_kind(lexer, allow_directive, allow_object, allow_pragma);
    if (kind == PEEK_EXTRAS_NONE) return false;
    bool at_line_end = kind != PEEK_EXTRAS_DIRECTIVE && empty_directives_at_line_end(state, lexer);
    if (kind == PEEK_EXTRAS_DECLARATION && at_line_end) return false;
    bool consumed_backslash = false;
    skip_leading_spaces_and_splices(lexer, is_c_space, NULL, &consumed_backslash);
    if (!consumed_backslash && lexer->lookahead == '#') {
        return allow_directive && scan_hash_directive(state, lexer, valid_symbols, false);
    }
    if ((!allow_object && !allow_pragma) || at_line_end) return false;
    return scan_declaration_tokens(scanner, lexer, valid_symbols, consumed_backslash);
}

static bool scan_empty_directive_extra(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols, bool error_recovery) {
    bool directive_body = !error_recovery && (valid_symbols[PREPROC_NEWLINE] || valid_symbols[PREPROC_LPAREN] ||
        valid_symbols[PREPROC_ARG] || valid_symbols[PREPROC_DIRECTIVE_ARG] || valid_symbols[GNU_RAW_STRING_BODY]);
    bool macro_name = !error_recovery && valid_symbols[PREPROC_FUNCTION_NAME];
    if (valid_symbols[PREPROC_EMPTY] && !macro_name && (!directive_body || lexer->lookahead == '#') &&
        empty_directives_consume(lexer, state, true)) {
        lexer->mark_end(lexer);
        lexer->result_symbol = PREPROC_EMPTY;
        return true;
    }
    return false;
}

static bool scan_non_declaration_tokens(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols) {
    if (valid_symbols[GNU_RAW_STRING_BODY]) {
        lexer->result_symbol = GNU_RAW_STRING_BODY;
        return scan_gnu_raw_string_token(lexer);
    }
    if (valid_symbols[RAW_MACRO_TYPE_TAIL]) {
        lexer->result_symbol = RAW_MACRO_TYPE_TAIL;
        return scan_raw_macro_type_tail(lexer, &(PragmaTrivia){empty_directives_skip, state});
    }
    if (valid_symbols[PREPROC_FUNCTION_NAME]) {
        lexer->result_symbol = PREPROC_FUNCTION_NAME;
        return scan_function_macro_name(lexer, valid_symbols[PRAGMA_OPERATOR], PRAGMA_OPERATOR);
    }
    return scan_preproc_tokens(state, lexer, valid_symbols);
}

static bool scan_hash_directive(EmptyDirectives *state, TSLexer *lexer, const bool *valid_symbols, bool error_recovery) {
    char word[10] = {0};
    bool at_start = empty_directives_at_start(state, lexer);
    if ((!at_start && !error_recovery) || !empty_directives_scan_word(lexer, word, sizeof word)) return false;
    if (!at_start || !empty_directives_after_marked_keyword(state, lexer)) {
        if (!error_recovery) return false;
        lexer->result_symbol = GNU_RAW_STRING_BODY;
        return true;
    }
    bool ifdef = strcmp(word, "ifdef") == 0;
    bool conditional = !error_recovery && (valid_symbols[LEADING_CONDITIONAL_MARKER_IFDEF] ||
        valid_symbols[LEADING_CONDITIONAL_MARKER_IFNDEF] || valid_symbols[CONDITIONAL_MARKER_IFDEF] ||
        valid_symbols[CONDITIONAL_MARKER_IFNDEF]);
    if (conditional && (ifdef || strcmp(word, "ifndef") == 0)) {
        TSLexerCheckpoint end;
        lexer->get_mark_end_checkpoint(lexer, &end);
        const ConditionalMacroSymbols symbols = {
            .ifdef = CONDITIONAL_MARKER_IFDEF, .ifndef = CONDITIONAL_MARKER_IFNDEF,
            .leading_ifdef = LEADING_CONDITIONAL_MARKER_IFDEF, .leading_ifndef = LEADING_CONDITIONAL_MARKER_IFNDEF,
            .skip_empty = empty_directives_skip, .empty_context = state,
        };
        if (scan_conditional_macro_after_keyword(lexer, ifdef, &symbols, valid_symbols)) return true;
        lexer->mark_end_at(lexer, &end);
    }
    return empty_directives_select_symbol(word, &directive_symbols, valid_symbols, &lexer->result_symbol);
}

static bool scan_declaration_tokens(CScanner *scanner, TSLexer *lexer, const bool *valid_symbols, bool consumed_backslash) {
    EmptyDirectives *state = scanner_directives(scanner);
    int32_t c = lexer->lookahead;
    bool can_start_braced = valid_symbols[BRACED_MACRO_TYPE_START] && !consumed_backslash && (c == '[' || starts_macro_scan(c, false));
    if (!can_start_braced && !starts_macro_scan(c, consumed_backslash)) return false;
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
    if (can_start_braced) {
        lexer->result_symbol = BRACED_MACRO_TYPE_START;
        return scan_braced_macro_type_start(lexer, &symbols, NULL, 0);
    }
    for (unsigned i = 0; i < sizeof(attribute_tokens) / sizeof(attribute_tokens[0]); i++) {
        TSSymbol token = attribute_tokens[i];
        if (!valid_symbols[token]) continue;
        lexer->result_symbol = token;
        return scan_function_attribute_guard_from(lexer,
            token == FUNCTION_ATTRIBUTE_START || token == POST_TYPE_FUNCTION_ATTRIBUTE_START,
            token != FUNCTION_ATTRIBUTE_START, token == TRAILING_MACRO_ATTRIBUTE_NAME, consumed_backslash, &symbols);
    }
    if (consumed_backslash) return false;
    return scan_preproc_tokens(state, lexer, valid_symbols);
}

// code-gauge-allow functionCognitiveComplexity -- External-token validity selects one preprocessor lexing mode and preserves its token range.
// code-gauge-allow functionNcss -- External-token validity selects one preprocessor lexing mode and preserves its token range.
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
        if (pragma_eof(lexer) || scan_preproc_newline(lexer, false)) {
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
    return valid_symbols[PRAGMA_OPERATOR] && empty_directives_pragma_possible(state) &&
        scan_pragma_with(lexer, &(PragmaTrivia){empty_directives_skip, state});
}

static bool is_c_space(int32_t c) {
    return pragma_space(c);
}

static bool starts_macro_scan(int32_t c, bool consumed_backslash) {
    if (consumed_backslash) return c == 'u' || c == 'U';
    if (c < 0) return false;
    if (c < 0x80) return c == '\\' || ((preproc_identifier_start_ascii[c / 64] >> (c % 64)) & 1);
    return preproc_identifier_character(c, false);
}

static EmptyDirectives *scanner_directives(CScanner *scanner) {
    return scanner ? &scanner->directives : NULL;
}
