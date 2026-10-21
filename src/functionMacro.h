#ifndef TREE_SITTER_C_FUNCTION_MACRO_H_
#define TREE_SITTER_C_FUNCTION_MACRO_H_

#include "pragma.h"
#include "keywords.h"
#include <stdlib.h>

typedef struct {
    bool identifier;
    bool number;
    int32_t last;
} MacroArgumentWord;

typedef struct MacroArgumentTag {
    unsigned level;
    struct MacroArgumentTag *parent;
} MacroArgumentTag;

typedef struct {
    int32_t previous;
    MacroArgumentTag *tag;
    unsigned body_level;
} MacroArgumentContext;

typedef enum {
    MACRO_ARGUMENT_INVALID,
    MACRO_ARGUMENT_CONSUMED,
    MACRO_ARGUMENT_PUNCTUATION
} MacroArgumentToken;

typedef enum {
    MACRO_SLASH_INVALID,
    MACRO_SLASH_DIVISION,
    MACRO_SLASH_COMMENT
} MacroArgumentSlash;

typedef struct {
    bool post_type;
    bool declarator_group;
    bool explicit_type;
    bool modifier;
    bool declarator_name;
} MacroPrototypeTail;

static bool function_macro_balanced(TSLexer *lexer, int32_t open, int32_t close, bool *literal);
static bool function_macro_group(int32_t c, int32_t open, int32_t close, unsigned *depth, unsigned *nested, MacroArgumentContext *context);
static void function_macro_note_literal(bool *literal, unsigned depth, unsigned nested, const MacroArgumentWord *word, int32_t c);
static bool function_macro_tail_word(TSLexer *lexer, bool escaped, MacroPrototypeTail *tail);
static bool function_macro_tail_group(TSLexer *lexer, int32_t c, MacroPrototypeTail *tail);
static bool function_macro_declaration_continues(TSLexer *lexer, bool post_type);
static bool function_macro_argument_quote(TSLexer *lexer, int32_t quote);
static bool function_macro_argument_escape(TSLexer *lexer, MacroArgumentWord *word);
static MacroArgumentSlash function_macro_argument_slash(TSLexer *lexer, bool allow_division);
static bool function_macro_argument_name(TSLexer *lexer, MacroArgumentWord *word, MacroArgumentContext *context, unsigned level);
static void function_macro_argument_context(MacroArgumentContext *context, int32_t c, unsigned level);
static MacroArgumentToken function_macro_argument_token(TSLexer *lexer, MacroArgumentWord *word, MacroArgumentContext *context, unsigned level);
static bool function_macro_argument_tag(MacroArgumentContext *context, unsigned level);
static void function_macro_argument_drop_tags(MacroArgumentContext *context, unsigned level);
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
    MacroArgumentContext context = {0};
    bool valid = false;
    lexer->advance(lexer, false);
    while (depth) {
        int32_t c = lexer->lookahead;
        if (lexer->eof(lexer) || (c == ';' && !context.body_level)) goto done;
        function_macro_note_literal(literal, depth, nested, &word, c);
        MacroArgumentToken token = function_macro_argument_token(lexer, &word, &context, depth + nested);
        if (token == MACRO_ARGUMENT_INVALID) goto done;
        if (token == MACRO_ARGUMENT_CONSUMED) continue;
        function_macro_argument_word(&word, c);
        function_macro_argument_context(&context, c, depth + nested);
        if (!function_macro_group(c, open, close, &depth, &nested, &context)) goto done;
        lexer->advance(lexer, false);
    }
    valid = nested == 0;
done:
    function_macro_argument_drop_tags(&context, 0);
    return valid;
}

static MacroArgumentToken function_macro_argument_token(TSLexer *lexer, MacroArgumentWord *word, MacroArgumentContext *context, unsigned level) {
    int32_t c = lexer->lookahead;
    if (pragma_space(c)) {
        lexer->advance(lexer, false);
        *word = (MacroArgumentWord){0};
        return MACRO_ARGUMENT_CONSUMED;
    }
    switch (c) {
        case '/': {
            MacroArgumentSlash slash = function_macro_argument_slash(lexer, true);
            if (slash == MACRO_SLASH_INVALID) return MACRO_ARGUMENT_INVALID;
            if (slash == MACRO_SLASH_DIVISION) function_macro_argument_context(context, '/', level);
            break;
        }
        case '\\':
            if (!function_macro_argument_escape(lexer, word)) return MACRO_ARGUMENT_INVALID;
            if (word->identifier || word->number) context->previous = 'w';
            return MACRO_ARGUMENT_CONSUMED;
        case '"':
        case '\'':
            if (c == '\'' && word->number) return MACRO_ARGUMENT_PUNCTUATION;
            if (!function_macro_argument_quote(lexer, c)) return MACRO_ARGUMENT_INVALID;
            function_macro_argument_context(context, c, level);
            break;
        default:
            if (!word->number && preproc_word(c, false)) {
                return function_macro_argument_name(lexer, word, context, level)
                    ? MACRO_ARGUMENT_CONSUMED : MACRO_ARGUMENT_INVALID;
            }
            return MACRO_ARGUMENT_PUNCTUATION;
    }
    *word = (MacroArgumentWord){0};
    return MACRO_ARGUMENT_CONSUMED;
}

static bool function_macro_argument_name(TSLexer *lexer, MacroArgumentWord *word, MacroArgumentContext *context, unsigned level) {
    char text[FUNCTION_MACRO_KEYWORD_MAX_LENGTH + 1] = {0};
    MacroName name = {.word = text, .capacity = sizeof(text) - 1, .ascii = !word->identifier};
    MacroNameCharacter character;
    do {
        character = scan_macro_name_character(lexer, name.length || !name.ascii, &name);
    } while (character == MACRO_NAME_CHARACTER || character == MACRO_NAME_SPLICE);
    if (character == MACRO_NAME_INVALID) return false;
    if (name.ascii && !context->body_level && function_macro_word_in(text, function_macro_tag_keywords,
        sizeof(function_macro_tag_keywords) / sizeof(function_macro_tag_keywords[0])) &&
        !function_macro_argument_tag(context, level)) return false;
    word->identifier = true;
    context->previous = 'w';
    return true;
}

static void function_macro_argument_context(MacroArgumentContext *context, int32_t c, unsigned level) {
    if (c == '{') {
        bool body = (context->tag && context->tag->level == level) || (context->previous == '(' && level > 1);
        if (body && !context->body_level) context->body_level = level + 1;
        function_macro_argument_drop_tags(context, level);
    } else if (c != '(' && c != '[' && c != ':') {
        function_macro_argument_drop_tags(context, level);
    }
    context->previous = c;
}

static bool function_macro_argument_tag(MacroArgumentContext *context, unsigned level) {
    if (context->tag && context->tag->level == level) return true;
    MacroArgumentTag *tag = malloc(sizeof(MacroArgumentTag));
    if (!tag) return false;
    *tag = (MacroArgumentTag){.level = level, .parent = context->tag};
    context->tag = tag;
    return true;
}

static void function_macro_argument_drop_tags(MacroArgumentContext *context, unsigned level) {
    while (context->tag && context->tag->level >= level) {
        MacroArgumentTag *tag = context->tag;
        context->tag = tag->parent;
        free(tag);
    }
}

static bool function_macro_group(int32_t c, int32_t open, int32_t close, unsigned *depth, unsigned *nested, MacroArgumentContext *context) {
    if (c == open) (*depth)++;
    else if (c == close) (*depth)--;
    else if (c > 0 && c < 128 && strchr("([{", c)) (*nested)++;
    else if (c > 0 && c < 128 && strchr(")]}", c)) {
        if (!*nested) return false;
        (*nested)--;
    }
    unsigned level = *depth + *nested;
    function_macro_argument_drop_tags(context, level + 1);
    if (context->body_level > level) context->body_level = 0;
    return true;
}

static void function_macro_note_literal(bool *literal, unsigned depth, unsigned nested, const MacroArgumentWord *word, int32_t c) {
    if (!literal || depth != 1 || nested) return;
    if (c == '"' || (c == '\'' && !word->number) || (c >= '0' && c <= '9' && !word->identifier)) *literal = true;
}

static bool function_macro_declaration_continues(TSLexer *lexer, bool post_type) {
    MacroPrototypeTail tail = {.post_type = post_type, .explicit_type = post_type};
    for (;;) {
        bool escaped = false;
        if (!function_macro_tail_spacing(lexer, &escaped) || lexer->eof(lexer)) return false;
        int32_t c = lexer->lookahead;
        if (escaped || preproc_word(c, false)) {
            if (!function_macro_tail_word(lexer, escaped, &tail)) return false;
        } else if (c == ';') {
            return tail.declarator_group && tail.explicit_type;
        } else if (c <= 127 && strchr("{}#)]", c)) {
            return false;
        } else if (c == '(' || c == '[') {
            if (!function_macro_tail_group(lexer, c, &tail)) return false;
        } else if (c == '"' || c == '\'') {
            if (!function_macro_argument_quote(lexer, c)) return false;
        } else {
            if (c == '*' && tail.post_type && tail.declarator_name && !tail.declarator_group) return false;
            lexer->advance(lexer, false);
            tail.modifier = false;
        }
    }
}

static bool function_macro_tail_group(TSLexer *lexer, int32_t c, MacroPrototypeTail *tail) {
    bool literal = false;
    if (!function_macro_balanced(lexer, c, c == '(' ? ')' : ']', &literal)) return false;
    if (c == '(' && !tail->modifier) {
        if (literal && tail->post_type && !tail->declarator_group) tail->declarator_name = false;
        else tail->declarator_group = true;
    }
    tail->modifier = false;
    return true;
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

static bool function_macro_tail_word(TSLexer *lexer, bool escaped, MacroPrototypeTail *tail) {
    char word[FUNCTION_MACRO_KEYWORD_MAX_LENGTH + 1] = {0};
    MacroName name = {.word = word, .capacity = sizeof(word) - 1, .ascii = !escaped};
    if (escaped && !scan_macro_name_ucn(lexer)) return false;
    bool continuation = escaped;
    while (scan_macro_name_character(lexer, continuation, &name) == MACRO_NAME_CHARACTER) continuation = true;
    bool pragma = name.ascii && strcmp(word, pragma_word) == 0;
    bool keyword = name.ascii && function_macro_keyword(word);
    if (tail->post_type && !tail->declarator_group && !keyword && !pragma) {
        if (tail->declarator_name) return false;
        tail->declarator_name = true;
    }
    tail->explicit_type |= name.ascii && function_macro_word_in(word, function_macro_type_keywords,
        sizeof(function_macro_type_keywords) / sizeof(function_macro_type_keywords[0]));
    tail->modifier = pragma || (name.ascii && function_macro_word_in(word, function_macro_group_modifiers,
        sizeof(function_macro_group_modifiers) / sizeof(function_macro_group_modifiers[0])));
    return !tail->post_type || !keyword ||
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

static MacroArgumentSlash function_macro_argument_slash(TSLexer *lexer, bool allow_division) {
    lexer->advance(lexer, false);
    if (scan_preproc_splices(lexer)) {
        if (lexer->lookahead == '/') return function_macro_line_comment(lexer) ? MACRO_SLASH_COMMENT : MACRO_SLASH_INVALID;
        if (lexer->lookahead == '*') return function_macro_block_comment(lexer) ? MACRO_SLASH_COMMENT : MACRO_SLASH_INVALID;
    }
    return allow_division ? MACRO_SLASH_DIVISION : MACRO_SLASH_INVALID;
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
