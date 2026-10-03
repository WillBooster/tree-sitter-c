#include "pragma.h"

enum TokenType { PRAGMA_OPERATOR, PREPROC_ARG, PREPROC_NEWLINE };

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
    if (valid_symbols[PREPROC_NEWLINE]) {
        while (pragma_space(lexer->lookahead) && lexer->lookahead != '\n' && lexer->lookahead != '\r') {
            lexer->advance(lexer, true);
        }
        if (lexer->lookahead == '\r') lexer->advance(lexer, false);
        if (lexer->lookahead == '\n') {
            lexer->advance(lexer, false);
            lexer->mark_end(lexer);
            lexer->result_symbol = PREPROC_NEWLINE;
            return true;
        }
    }
    if (valid_symbols[PREPROC_ARG]) {
        lexer->result_symbol = PREPROC_ARG;
        return scan_pragma_preproc_arg(lexer);
    }
    lexer->result_symbol = PRAGMA_OPERATOR;
    return valid_symbols[PRAGMA_OPERATOR] && scan_pragma(lexer);
}
