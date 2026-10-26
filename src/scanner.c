#include "conditionalMacro.h"

enum TokenType { PRAGMA_OPERATOR, PREPROC_ARG, PREPROC_NEWLINE, PREPROC_LPAREN, PREPROC_DIRECTIVE_ARG, PREPROC_FUNCTION_NAME, FUNCTION_ATTRIBUTE_START, POST_TYPE_FUNCTION_ATTRIBUTE_START, POST_TYPE_FUNCTION_ATTRIBUTE_SUFFIX, TRAILING_MACRO_ATTRIBUTE_NAME, TRAILING_OBJECT_DECLARATION_START, CONDITIONAL_MARKER_IFDEF, CONDITIONAL_MARKER_IFNDEF, LEADING_CONDITIONAL_MARKER_IFDEF, LEADING_CONDITIONAL_MARKER_IFNDEF, BRACED_FUNCTION_ATTRIBUTE_START };

static bool scan_preproc_tokens(TSLexer *lexer, const bool *valid_symbols);

void *tree_sitter_c_external_scanner_create(void) {
    return NULL;
}

void tree_sitter_c_external_scanner_destroy(void *payload) {
    (void)payload;
}

unsigned tree_sitter_c_external_scanner_serialize(void *payload, char *buffer) {
    (void)payload;
    (void)buffer;
    return 0;
}

void tree_sitter_c_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    (void)payload;
    (void)buffer;
    (void)length;
}

bool tree_sitter_c_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    (void)payload;
    if (valid_symbols[PREPROC_FUNCTION_NAME] && !valid_symbols[PREPROC_LPAREN]) {
        lexer->result_symbol = PREPROC_FUNCTION_NAME;
        return scan_function_macro_name(lexer, valid_symbols[PRAGMA_OPERATOR], PRAGMA_OPERATOR);
    }
    if (valid_symbols[PREPROC_LPAREN] || valid_symbols[PREPROC_NEWLINE] ||
        valid_symbols[PREPROC_ARG] || valid_symbols[PREPROC_DIRECTIVE_ARG]) {
        return scan_preproc_tokens(lexer, valid_symbols);
    }
    bool leading = valid_symbols[LEADING_CONDITIONAL_MARKER_IFDEF] || valid_symbols[LEADING_CONDITIONAL_MARKER_IFNDEF];
    bool conditional = leading || valid_symbols[CONDITIONAL_MARKER_IFDEF] || valid_symbols[CONDITIONAL_MARKER_IFNDEF];
    if (conditional) {
        while (pragma_space(lexer->lookahead)) lexer->advance(lexer, true);
        const ConditionalMacroSymbols symbols = {
            .ifdef = CONDITIONAL_MARKER_IFDEF, .ifndef = CONDITIONAL_MARKER_IFNDEF,
            .leading_ifdef = LEADING_CONDITIONAL_MARKER_IFDEF, .leading_ifndef = LEADING_CONDITIONAL_MARKER_IFNDEF,
        };
        if (lexer->lookahead == '#') return scan_conditional_macro(lexer, &symbols, valid_symbols);
    }
    static const TSSymbol attribute_tokens[] = {
        FUNCTION_ATTRIBUTE_START, POST_TYPE_FUNCTION_ATTRIBUTE_START, POST_TYPE_FUNCTION_ATTRIBUTE_SUFFIX,
        TRAILING_MACRO_ATTRIBUTE_NAME, TRAILING_OBJECT_DECLARATION_START, BRACED_FUNCTION_ATTRIBUTE_START,
    };
    const MacroAttributeSymbols symbols = {
        .pragma = PRAGMA_OPERATOR,
        .object_start = TRAILING_OBJECT_DECLARATION_START,
        .allow_pragma = valid_symbols[PRAGMA_OPERATOR],
        .allow_object_start = valid_symbols[TRAILING_OBJECT_DECLARATION_START],
        .braced_start = BRACED_FUNCTION_ATTRIBUTE_START,
        .allow_braced_start = valid_symbols[BRACED_FUNCTION_ATTRIBUTE_START],
    };
    for (unsigned i = 0; i < sizeof(attribute_tokens) / sizeof(attribute_tokens[0]); i++) {
        TSSymbol token = attribute_tokens[i];
        if (!valid_symbols[token]) continue;
        lexer->result_symbol = token;
        return scan_function_attribute_guard(lexer,
            token == FUNCTION_ATTRIBUTE_START || token == POST_TYPE_FUNCTION_ATTRIBUTE_START,
            token != FUNCTION_ATTRIBUTE_START, token == TRAILING_MACRO_ATTRIBUTE_NAME, &symbols);
    }
    return scan_preproc_tokens(lexer, valid_symbols);
}

static bool scan_preproc_tokens(TSLexer *lexer, const bool *valid_symbols) {
    bool directive_text = !valid_symbols[PREPROC_ARG] && valid_symbols[PREPROC_DIRECTIVE_ARG];
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
                return argument_valid && scan_preproc_arg(lexer, true, directive_text);
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
        return scan_preproc_arg(lexer, false, directive_text);
    }
    lexer->result_symbol = PRAGMA_OPERATOR;
    return valid_symbols[PRAGMA_OPERATOR] && scan_pragma(lexer);
}
