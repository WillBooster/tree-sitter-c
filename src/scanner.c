#include "functionMacro.h"

enum TokenType { PRAGMA_OPERATOR, PREPROC_ARG, PREPROC_NEWLINE, PREPROC_LPAREN, PREPROC_DIRECTIVE_ARG, PREPROC_FUNCTION_NAME, FUNCTION_ATTRIBUTE_START, POST_TYPE_FUNCTION_ATTRIBUTE_START, POST_TYPE_FUNCTION_ATTRIBUTE_SUFFIX };

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
    bool leading = valid_symbols[FUNCTION_ATTRIBUTE_START];
    bool post_type = valid_symbols[POST_TYPE_FUNCTION_ATTRIBUTE_START];
    bool suffix = valid_symbols[POST_TYPE_FUNCTION_ATTRIBUTE_SUFFIX];
    if ((leading || post_type || suffix) && !valid_symbols[PREPROC_LPAREN] &&
        !valid_symbols[PREPROC_NEWLINE] && !valid_symbols[PREPROC_ARG] && !valid_symbols[PREPROC_DIRECTIVE_ARG]) {
        lexer->result_symbol = leading ? FUNCTION_ATTRIBUTE_START : post_type ? POST_TYPE_FUNCTION_ATTRIBUTE_START : POST_TYPE_FUNCTION_ATTRIBUTE_SUFFIX;
        return scan_function_attribute_guard(lexer, leading || post_type, !leading);
    }
    return scan_preproc_tokens(lexer, valid_symbols);
}

static bool scan_preproc_tokens(TSLexer *lexer, const bool *valid_symbols) {
    bool directive_text = !valid_symbols[PREPROC_ARG] && valid_symbols[PREPROC_DIRECTIVE_ARG];
    TSSymbol argument_symbol = directive_text ? PREPROC_DIRECTIVE_ARG : PREPROC_ARG;
    if (valid_symbols[PREPROC_LPAREN]) {
        while (lexer->lookahead == '\\') {
            lexer->advance(lexer, true);
            if (!scan_preproc_newline(lexer, true)) return false;
        }
        if (lexer->lookahead == '(') {
            lexer->advance(lexer, false);
            lexer->mark_end(lexer);
            lexer->result_symbol = PREPROC_LPAREN;
            return true;
        }
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
                return (valid_symbols[PREPROC_ARG] || directive_text) && scan_preproc_arg(lexer, true, directive_text);
            }
        }
        if (scan_preproc_newline(lexer, false)) {
            lexer->mark_end(lexer);
            lexer->result_symbol = PREPROC_NEWLINE;
            return true;
        }
    }
    if (valid_symbols[PREPROC_ARG] || directive_text) {
        lexer->result_symbol = argument_symbol;
        return scan_preproc_arg(lexer, false, directive_text);
    }
    lexer->result_symbol = PRAGMA_OPERATOR;
    return valid_symbols[PRAGMA_OPERATOR] && scan_pragma(lexer);
}
