#ifndef TREE_SITTER_C_FUNCTION_MACRO_H_
#define TREE_SITTER_C_FUNCTION_MACRO_H_

#include "pragma.h"
#include "keywords.h"

typedef struct {
    bool identifier;
    bool number;
    int32_t last;
} MacroArgumentWord;

static bool function_macro_arguments_before_declarator(TSLexer *lexer);
static bool function_macro_balanced(TSLexer *lexer, int32_t open, int32_t close);
static bool function_macro_declaration_continues(TSLexer *lexer);
static bool function_macro_argument_quote(TSLexer *lexer, int32_t quote);
static bool function_macro_argument_escape(TSLexer *lexer, MacroArgumentWord *word);
static bool function_macro_argument_slash(TSLexer *lexer);
static bool function_macro_line_comment(TSLexer *lexer);
static bool function_macro_block_comment(TSLexer *lexer);
static void function_macro_argument_word(MacroArgumentWord *word, int32_t c);

static bool function_macro_tail_keyword(TSLexer *lexer);
static bool function_macro_keyword(const char *word);

static bool scan_function_attribute_name(TSLexer *lexer, bool allow_pragma, TSSymbol pragma_symbol, bool declaration_context) {
    char word[FUNCTION_MACRO_KEYWORD_MAX_LENGTH + 1] = {0};
    MacroName name = {.word = word, .capacity = sizeof(word) - 1, .ascii = true};
    if (!scan_macro_name(lexer, &name)) return false;
    if (allow_pragma && name.ascii && strcmp(word, pragma_word) == 0 && scan_pragma_suffix(lexer)) {
        lexer->result_symbol = pragma_symbol;
        return true;
    }
    if (name.ascii && function_macro_keyword(word)) return false;
    if (!scan_pragma_spacing(lexer) || lexer->lookahead != '(') return false;
    return !declaration_context || function_macro_arguments_before_declarator(lexer);
}

static bool function_macro_arguments_before_declarator(TSLexer *lexer) {
    return function_macro_balanced(lexer, '(', ')') && function_macro_declaration_continues(lexer);
}

static bool function_macro_balanced(TSLexer *lexer, int32_t open, int32_t close) {
    unsigned depth = 1;
    MacroArgumentWord word = {0};
    lexer->advance(lexer, false);
    while (depth) {
        if (lexer->eof(lexer)) return false;
        int32_t c = lexer->lookahead;
        if (pragma_space(c)) {
            lexer->advance(lexer, false);
            word = (MacroArgumentWord){0};
            continue;
        }
        if (c == '/') {
            if (!function_macro_argument_slash(lexer)) return false;
            word = (MacroArgumentWord){0};
            continue;
        }
        if (c == '\\') {
            if (!function_macro_argument_escape(lexer, &word)) return false;
            continue;
        }
        if (c == '"' || (c == '\'' && !word.number)) {
            if (!function_macro_argument_quote(lexer, c)) return false;
            word = (MacroArgumentWord){0};
            continue;
        }
        function_macro_argument_word(&word, c);
        if (c == open) depth++;
        if (c == close) depth--;
        lexer->advance(lexer, false);
    }
    return true;
}

static bool function_macro_declaration_continues(TSLexer *lexer) {
    bool declarator_group = false;
    bool keyword = true;
    for (;;) {
        if (!scan_pragma_spacing(lexer) || lexer->eof(lexer)) return false;
        int32_t c = lexer->lookahead;
        if (c == ';') return declarator_group;
        if (c <= 127 && strchr("{}#)]", c)) return false;
        if (c == '(' || c == '[') {
            if (!function_macro_balanced(lexer, c, c == '(' ? ')' : ']')) return false;
            declarator_group |= c == '(' && !keyword;
            keyword = true;
        } else if (preproc_word(c, false)) {
            keyword = function_macro_tail_keyword(lexer);
        } else if (c == '"' || c == '\'') {
            if (!function_macro_argument_quote(lexer, c)) return false;
        } else {
            lexer->advance(lexer, false);
            keyword = false;
        }
    }
}

static bool function_macro_tail_keyword(TSLexer *lexer) {
    char word[FUNCTION_MACRO_KEYWORD_MAX_LENGTH + 1] = {0};
    unsigned length = 0;
    bool ascii = true;
    do {
        int32_t c = lexer->lookahead;
        if (c < 128 && length < sizeof(word) - 1) word[length++] = (char)c;
        else ascii = false;
        lexer->advance(lexer, false);
    } while (preproc_word(lexer->lookahead, true));
    return ascii && function_macro_keyword(word);
}

static bool function_macro_argument_escape(TSLexer *lexer, MacroArgumentWord *word) {
    lexer->advance(lexer, false);
    if (scan_preproc_newline(lexer, false)) return true;
    if (!scan_preproc_ucn(lexer, &word->number)) return false;
    word->identifier = !word->number;
    return true;
}

static bool function_macro_argument_quote(TSLexer *lexer, int32_t quote) {
    lexer->advance(lexer, false);
    while (!lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        lexer->advance(lexer, false);
        if (c == quote) return true;
        if (c == '\n' || c == '\r') return false;
        if (c != '\\') continue;
        if (scan_preproc_newline(lexer, false)) continue;
        if (!scan_preproc_splices(lexer)) continue;
        if (lexer->eof(lexer)) return false;
        lexer->advance(lexer, false);
    }
    return false;
}

static bool function_macro_argument_slash(TSLexer *lexer) {
    lexer->advance(lexer, false);
    if (!scan_preproc_splices(lexer)) return true;
    if (lexer->lookahead == '/') return function_macro_line_comment(lexer);
    if (lexer->lookahead == '*') return function_macro_block_comment(lexer);
    return true;
}

static bool function_macro_line_comment(TSLexer *lexer) {
    lexer->advance(lexer, false);
    while (!lexer->eof(lexer) && lexer->lookahead != '\n' && lexer->lookahead != '\r') {
        if (lexer->lookahead == '\\') {
            do {
                lexer->advance(lexer, false);
            } while (lexer->lookahead == '\\');
            if (scan_preproc_newline(lexer, false)) continue;
            if (lexer->eof(lexer)) return false;
        }
        lexer->advance(lexer, false);
    }
    return true;
}

static bool function_macro_block_comment(TSLexer *lexer) {
    lexer->advance(lexer, false);
    bool star = false;
    while (!lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        lexer->advance(lexer, false);
        if (c == '\\' && scan_preproc_newline(lexer, false)) continue;
        if (star && c == '/') return true;
        star = c == '*';
    }
    return false;
}

static void function_macro_argument_word(MacroArgumentWord *word, int32_t c) {
    bool member = preproc_word(c, word->identifier || word->number);
    bool digit = c >= '0' && c <= '9';
    bool exponent_sign = word->number && (c == '+' || c == '-') &&
                         (word->last == 'e' || word->last == 'E' || word->last == 'p' || word->last == 'P');
    if (c == '.') word->identifier = false;
    if (!member && !digit && c != '.' && c != '\'' && !exponent_sign) *word = (MacroArgumentWord){0};
    if (digit && !word->identifier) word->number = true;
    if (member && !word->number) word->identifier = true;
    if (word->number) word->last = c;
}

static bool function_macro_keyword(const char *word) {
    unsigned start = 0;
    unsigned end = sizeof(function_macro_keywords) / sizeof(function_macro_keywords[0]);
    while (start < end) {
        unsigned middle = start + (end - start) / 2;
        int order = strcmp(word, function_macro_keywords[middle]);
        if (order == 0) return true;
        if (order < 0) end = middle;
        else start = middle + 1;
    }
    return false;
}

#endif
