#ifndef TREE_SITTER_C_PRAGMA_H_
#define TREE_SITTER_C_PRAGMA_H_

#include "tree_sitter/parser.h"

static bool scan_pragma_spacing(TSLexer *lexer);
static bool pragma_space(int32_t c);
static bool scan_pragma_word(TSLexer *lexer);
static bool scan_preproc_newline(TSLexer *lexer, bool skip);
static bool scan_preproc_splices(TSLexer *lexer);

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

static bool scan_preproc_arg(TSLexer *lexer, bool has_content) {
    while (!has_content && pragma_space(lexer->lookahead) && lexer->lookahead != '\n' && lexer->lookahead != '\r') {
        lexer->advance(lexer, true);
    }
    bool after_comment = false;
    bool in_number = false;
    bool in_identifier = false;
    while (!lexer->eof(lexer) && lexer->lookahead != '\n' && lexer->lookahead != '\r') {
        int32_t c = lexer->lookahead;
        bool word = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || (c >= 0x80 && !pragma_space(c));
        bool digit = c >= '0' && c <= '9';
        if (!word && !digit && c != '.' && c != '\'' && c != '\\') {
            in_number = false;
            in_identifier = false;
        }
        if (digit && !in_identifier) in_number = true;
        if (word && !in_number) in_identifier = true;
        if (lexer->lookahead == '/') {
            lexer->advance(lexer, false);
            bool delimiter = scan_preproc_splices(lexer);
            if (delimiter && lexer->lookahead == '/') {
                if (!has_content || after_comment) break;
                while (!lexer->eof(lexer) && lexer->lookahead != '\n' && lexer->lookahead != '\r') {
                    if (lexer->lookahead == '\\') {
                        do {
                            lexer->advance(lexer, false);
                        } while (lexer->lookahead == '\\');
                        scan_preproc_newline(lexer, false);
                    } else {
                        lexer->advance(lexer, false);
                    }
                }
                lexer->mark_end(lexer);
                return true;
            }
            if (delimiter && lexer->lookahead == '*') {
                if (!has_content) return false;
                lexer->advance(lexer, false);
                bool star = false;
                while (!lexer->eof(lexer)) {
                    if (lexer->lookahead == '\\') {
                        if (!scan_preproc_splices(lexer)) star = false;
                        continue;
                    }
                    if (star && lexer->lookahead == '/') break;
                    star = lexer->lookahead == '*';
                    lexer->advance(lexer, false);
                }
                if (lexer->eof(lexer)) break;
                lexer->advance(lexer, false);
                after_comment = true;
                continue;
            }
            has_content = true;
            after_comment = false;
        } else if (lexer->lookahead == '\\') {
            lexer->advance(lexer, false);
            if (scan_preproc_newline(lexer, false)) {
                if (!after_comment && has_content) lexer->mark_end(lexer);
                continue;
            }
            in_number = false;
            in_identifier = false;
            has_content = true;
            after_comment = false;
        } else if (lexer->lookahead == '"' || (lexer->lookahead == '\'' && !in_number)) {
            int32_t quote = lexer->lookahead;
            in_number = false;
            in_identifier = false;
            lexer->advance(lexer, false);
            bool escaped = false;
            while (!lexer->eof(lexer) && lexer->lookahead != '\n' && lexer->lookahead != '\r') {
                if (lexer->lookahead == '\\') {
                    lexer->advance(lexer, false);
                    if (scan_preproc_newline(lexer, false)) continue;
                    escaped = !escaped;
                    continue;
                }
                bool closing = lexer->lookahead == quote && !escaped;
                lexer->advance(lexer, false);
                if (closing) break;
                escaped = false;
            }
            has_content = true;
            after_comment = false;
        } else {
            if (!pragma_space(lexer->lookahead)) {
                has_content = true;
                after_comment = false;
            }
            lexer->advance(lexer, false);
        }
        if (!after_comment && has_content) lexer->mark_end(lexer);
    }
    return has_content;
}

static bool scan_pragma_word(TSLexer *lexer) {
    const char *word = "_Pragma";
    for (; *word; word++) {
        if (lexer->lookahead != *word) return false;
        lexer->advance(lexer, false);
    }
    return true;
}

static bool scan_preproc_newline(TSLexer *lexer, bool skip) {
    bool carriage_return = lexer->lookahead == '\r';
    if (carriage_return) lexer->advance(lexer, skip);
    if (lexer->lookahead == '\n') {
        lexer->advance(lexer, skip);
        return true;
    }
    return carriage_return;
}

static bool scan_preproc_splices(TSLexer *lexer) {
    while (lexer->lookahead == '\\') {
        lexer->advance(lexer, false);
        if (!scan_preproc_newline(lexer, false)) return false;
    }
    return true;
}

static bool pragma_space(int32_t c) {
    return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\f' || c == '\v' ||
           c == 0x85 || c == 0xA0 || c == 0x1680 || (c >= 0x2000 && c <= 0x200A) ||
           c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000;
}

#endif
