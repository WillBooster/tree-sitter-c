#ifndef TREE_SITTER_C_PRAGMA_H_
#define TREE_SITTER_C_PRAGMA_H_

#include "tree_sitter/parser.h"

static bool scan_pragma_spacing(TSLexer *lexer);
static bool pragma_space(int32_t c);
static bool scan_pragma_word(TSLexer *lexer);

static bool scan_pragma(TSLexer *lexer) {
    while (pragma_space(lexer->lookahead)) {
        lexer->advance(lexer, true);
    }
    if (!scan_pragma_word(lexer)) return false;
    if (!scan_pragma_spacing(lexer) || lexer->lookahead != '(') return false;
    lexer->advance(lexer, false);
    if (!scan_pragma_spacing(lexer)) return false;
    if (lexer->lookahead == 'L' || lexer->lookahead == 'u' || lexer->lookahead == 'U') {
        bool utf8 = lexer->lookahead == 'u';
        lexer->advance(lexer, false);
        if (utf8 && lexer->lookahead == '8') lexer->advance(lexer, false);
    }
    if (lexer->lookahead != '"') return false;
    lexer->advance(lexer, false);
    while (lexer->lookahead != '"') {
        if (lexer->eof(lexer) || lexer->lookahead == '\n' || lexer->lookahead == '\r') return false;
        if (lexer->lookahead == '\\') {
            lexer->advance(lexer, false);
            if (lexer->eof(lexer)) return false;
            if (lexer->lookahead == '\r') {
                lexer->advance(lexer, false);
                if (lexer->lookahead != '\n') return false;
            }
        }
        lexer->advance(lexer, false);
    }
    lexer->advance(lexer, false);
    if (!scan_pragma_spacing(lexer) || lexer->lookahead != ')') return false;
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    return true;
}

static bool scan_pragma_spacing(TSLexer *lexer) {
    for (;;) {
        if (pragma_space(lexer->lookahead)) {
            lexer->advance(lexer, false);
        } else if (lexer->lookahead == '\\') {
            lexer->advance(lexer, false);
            if (lexer->lookahead == '\r') lexer->advance(lexer, false);
            if (lexer->lookahead != '\n') return false;
            lexer->advance(lexer, false);
        } else if (lexer->lookahead == '/') {
            lexer->advance(lexer, false);
            if (lexer->lookahead == '/') {
                lexer->advance(lexer, false);
                while (!lexer->eof(lexer) && lexer->lookahead != '\n') {
                    if (lexer->lookahead == '\\') {
                        do {
                            lexer->advance(lexer, false);
                        } while (lexer->lookahead == '\\');
                        if (lexer->lookahead == '\r') lexer->advance(lexer, false);
                        if (lexer->eof(lexer)) return false;
                    }
                    lexer->advance(lexer, false);
                }
            } else if (lexer->lookahead == '*') {
                lexer->advance(lexer, false);
                bool star = false;
                for (;;) {
                    if (lexer->eof(lexer)) return false;
                    if (star && lexer->lookahead == '/') {
                        lexer->advance(lexer, false);
                        break;
                    }
                    star = lexer->lookahead == '*';
                    lexer->advance(lexer, false);
                }
            } else {
                return false;
            }
        } else {
            return true;
        }
    }
}

static bool scan_pragma_preproc_arg(TSLexer *lexer) {
    while (pragma_space(lexer->lookahead) && lexer->lookahead != '\n' && lexer->lookahead != '\r') {
        lexer->advance(lexer, true);
    }
    if (!scan_pragma_word(lexer)) return false;
    bool backslash = false;
    bool after_comment = false;
    lexer->mark_end(lexer);
    while (!lexer->eof(lexer)) {
        if (after_comment && lexer->lookahead == '\\') {
            lexer->advance(lexer, false);
            if (lexer->lookahead == '\r') lexer->advance(lexer, false);
            if (lexer->lookahead == '\n') {
                lexer->advance(lexer, false);
                continue;
            }
            after_comment = false;
            lexer->mark_end(lexer);
        }
        if (lexer->lookahead == '\n') {
            if (!backslash) break;
            lexer->advance(lexer, false);
            backslash = false;
        } else if (lexer->lookahead == '/') {
            lexer->advance(lexer, false);
            if (lexer->lookahead == '*') {
                lexer->advance(lexer, false);
                bool star = false;
                while (!lexer->eof(lexer)) {
                    if (star && lexer->lookahead == '/') break;
                    star = lexer->lookahead == '*';
                    lexer->advance(lexer, false);
                }
                if (lexer->eof(lexer)) break;
                lexer->advance(lexer, false);
                after_comment = true;
                backslash = false;
                continue;
            }
            if (lexer->eof(lexer) || (after_comment && lexer->lookahead == '/')) break;
            backslash = lexer->lookahead == '\\';
            lexer->advance(lexer, false);
            after_comment = false;
        } else {
            if (!pragma_space(lexer->lookahead)) after_comment = false;
            if (lexer->lookahead != '\r') backslash = lexer->lookahead == '\\';
            lexer->advance(lexer, false);
        }
        if (!after_comment) lexer->mark_end(lexer);
    }
    return true;
}

static bool scan_pragma_word(TSLexer *lexer) {
    const char *word = "_Pragma";
    for (; *word; word++) {
        if (lexer->lookahead != *word) return false;
        lexer->advance(lexer, false);
    }
    return true;
}

static bool pragma_space(int32_t c) {
    return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\f' || c == '\v' ||
           c == 0x85 || c == 0xA0 || c == 0x1680 || (c >= 0x2000 && c <= 0x200A) ||
           c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000;
}

#endif
