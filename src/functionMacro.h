#ifndef TREE_SITTER_C_FUNCTION_MACRO_H_
#define TREE_SITTER_C_FUNCTION_MACRO_H_

#include "pragma.h"
#include "keywords.h"

typedef struct {
    bool identifier;
    bool number;
    int32_t last;
} MacroArgumentWord;

static bool function_macro_balanced(TSLexer *lexer, int32_t open, int32_t close, bool *literal);
static bool function_macro_group(int32_t c, int32_t open, int32_t close, unsigned *depth, unsigned *nested);
static void function_macro_note_literal(bool *literal, unsigned depth, unsigned nested, const MacroArgumentWord *word, int32_t c);
static bool function_macro_tail_word(TSLexer *lexer, bool escaped, bool post_type, bool *modifier, bool *explicit_type);
static bool function_macro_declaration_continues(TSLexer *lexer, bool post_type);
static bool function_macro_argument_quote(TSLexer *lexer, int32_t quote);
static bool function_macro_argument_escape(TSLexer *lexer, MacroArgumentWord *word);
static bool function_macro_argument_slash(TSLexer *lexer, bool allow_division);
static bool function_macro_tail_spacing(TSLexer *lexer, bool *escaped);
static bool function_macro_line_comment(TSLexer *lexer);
static bool function_macro_block_comment(TSLexer *lexer);
static void function_macro_argument_word(MacroArgumentWord *word, int32_t c);

static bool function_macro_keyword(const char *word);
static bool function_macro_word_in(const char *word, const char *const *words, unsigned count);

static bool scan_function_attribute_guard(TSLexer *lexer, bool prototype, bool require_literal, bool allow_pragma, TSSymbol pragma_symbol) {
    char word[FUNCTION_MACRO_KEYWORD_MAX_LENGTH + 1] = {0};
    MacroName name = {.word = word, .capacity = sizeof(word) - 1, .ascii = true, .lookahead_only = true};
    if (!scan_macro_name(lexer, &name)) return false;
    if (name.ascii && strcmp(word, pragma_word) == 0) {
        lexer->result_symbol = pragma_symbol;
        return allow_pragma && scan_pragma_suffix(lexer);
    }
    if (name.ascii && function_macro_keyword(word)) return false;
    if (!scan_pragma_spacing(lexer) || lexer->lookahead != '(') return false;
    bool literal = false;
    return function_macro_balanced(lexer, '(', ')', &literal) && (!require_literal || literal) &&
        (!prototype || function_macro_declaration_continues(lexer, require_literal));
}

static bool function_macro_balanced(TSLexer *lexer, int32_t open, int32_t close, bool *literal) {
    unsigned depth = 1;
    unsigned nested = 0;
    MacroArgumentWord word = {0};
    lexer->advance(lexer, false);
    while (depth) {
        if (lexer->eof(lexer)) return false;
        int32_t c = lexer->lookahead;
        function_macro_note_literal(literal, depth, nested, &word, c);
        if (pragma_space(c)) {
            lexer->advance(lexer, false);
            word = (MacroArgumentWord){0};
            continue;
        }
        if (c == '/') {
            if (!function_macro_argument_slash(lexer, true)) return false;
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
        if (!function_macro_group(c, open, close, &depth, &nested)) return false;
        lexer->advance(lexer, false);
    }
    return nested == 0;
}

static bool function_macro_group(int32_t c, int32_t open, int32_t close, unsigned *depth, unsigned *nested) {
    if (c == open) (*depth)++;
    else if (c == close) (*depth)--;
    else if (c > 0 && c < 128 && strchr("([{", c)) (*nested)++;
    else if (c > 0 && c < 128 && strchr(")]}", c)) {
        if (!*nested) return false;
        (*nested)--;
    }
    return true;
}

static void function_macro_note_literal(bool *literal, unsigned depth, unsigned nested, const MacroArgumentWord *word, int32_t c) {
    if (!literal || depth != 1 || nested) return;
    if (c == '"' || (c == '\'' && !word->number) || (c >= '0' && c <= '9' && !word->identifier)) *literal = true;
}

static bool function_macro_declaration_continues(TSLexer *lexer, bool post_type) {
    bool declarator_group = false;
    bool explicit_type = post_type;
    bool modifier = false;
    for (;;) {
        bool escaped = false;
        if (!function_macro_tail_spacing(lexer, &escaped) || lexer->eof(lexer)) return false;
        int32_t c = lexer->lookahead;
        if (escaped || preproc_word(c, false)) {
            if (!function_macro_tail_word(lexer, escaped, post_type, &modifier, &explicit_type)) return false;
        } else if (c == ';') {
            return declarator_group && explicit_type;
        } else if (c <= 127 && strchr("{}#)]", c)) {
            return false;
        } else if (c == '(' || c == '[') {
            if (!function_macro_balanced(lexer, c, c == '(' ? ')' : ']', NULL)) return false;
            declarator_group |= c == '(' && !modifier;
            modifier = false;
        } else if (c == '"' || c == '\'') {
            if (!function_macro_argument_quote(lexer, c)) return false;
        } else {
            lexer->advance(lexer, false);
            modifier = false;
        }
    }
}

static bool function_macro_tail_spacing(TSLexer *lexer, bool *escaped) {
    for (;;) {
        int32_t c = lexer->lookahead;
        if (pragma_space(c)) {
            lexer->advance(lexer, false);
        } else if (c == '\\') {
            lexer->advance(lexer, false);
            if (scan_preproc_newline(lexer, false)) continue;
            *escaped = lexer->lookahead == 'u' || lexer->lookahead == 'U';
            return *escaped;
        } else if (c == '/') {
            if (!function_macro_argument_slash(lexer, false)) return false;
        } else {
            return true;
        }
    }
}

static bool function_macro_tail_word(TSLexer *lexer, bool escaped, bool post_type, bool *modifier, bool *explicit_type) {
    char word[FUNCTION_MACRO_KEYWORD_MAX_LENGTH + 1] = {0};
    MacroName name = {.word = word, .capacity = sizeof(word) - 1, .ascii = !escaped};
    if (escaped && !scan_macro_name_ucn(lexer)) return false;
    bool continuation = escaped;
    while (scan_macro_name_character(lexer, continuation, &name) == MACRO_NAME_CHARACTER) continuation = true;
    *explicit_type |= name.ascii && function_macro_word_in(word, function_macro_type_keywords,
        sizeof(function_macro_type_keywords) / sizeof(function_macro_type_keywords[0]));
    *modifier = name.ascii && function_macro_word_in(word, function_macro_group_modifiers,
        sizeof(function_macro_group_modifiers) / sizeof(function_macro_group_modifiers[0]));
    return !post_type || !name.ascii || !function_macro_keyword(word) ||
        function_macro_word_in(word, function_macro_declaration_modifiers,
            sizeof(function_macro_declaration_modifiers) / sizeof(function_macro_declaration_modifiers[0]));
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

static bool function_macro_argument_slash(TSLexer *lexer, bool allow_division) {
    lexer->advance(lexer, false);
    if (!scan_preproc_splices(lexer)) return allow_division;
    if (lexer->lookahead == '/') return function_macro_line_comment(lexer);
    if (lexer->lookahead == '*') return function_macro_block_comment(lexer);
    return allow_division;
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
    return function_macro_word_in(word, function_macro_keywords,
        sizeof(function_macro_keywords) / sizeof(function_macro_keywords[0]));
}

static bool function_macro_word_in(const char *word, const char *const *words, unsigned count) {
    unsigned start = 0;
    unsigned end = count;
    while (start < end) {
        unsigned middle = start + (end - start) / 2;
        int order = strcmp(word, words[middle]);
        if (order == 0) return true;
        if (order < 0) end = middle;
        else start = middle + 1;
    }
    return false;
}

#endif
