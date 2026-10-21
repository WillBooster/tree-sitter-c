#ifndef TREE_SITTER_C_CONDITIONAL_MACRO_H_
#define TREE_SITTER_C_CONDITIONAL_MACRO_H_

#include "functionMacro.h"

static bool conditional_macro_word(TSLexer *lexer, MacroName *name, bool escaped);
static bool conditional_macro_spacing(TSLexer *lexer, bool *separated, bool *escaped);
static bool conditional_macro_next_line(TSLexer *lexer, bool *escaped);
static bool conditional_macro_directive(TSLexer *lexer, MacroName *name);
static bool conditional_macro_marker_line(TSLexer *lexer, bool *escaped);

static bool scan_conditional_macro(TSLexer *lexer, TSSymbol ifdef_symbol, TSSymbol ifndef_symbol,
                                   bool allow_ifdef, bool allow_ifndef) {
    char directive[7] = {0};
    MacroName command = {.word = directive, .capacity = sizeof(directive) - 1, .ascii = true};
    if (!conditional_macro_directive(lexer, &command) || !command.ascii) return false;
    if (strcmp(directive, "ifdef") == 0 && allow_ifdef) lexer->result_symbol = ifdef_symbol;
    else if (strcmp(directive, "ifndef") == 0 && allow_ifndef) lexer->result_symbol = ifndef_symbol;
    else return false;
    lexer->mark_end(lexer);

    bool separated = false;
    bool escaped = false;
    MacroName condition = {.ascii = true};
    if (!conditional_macro_spacing(lexer, &separated, &escaped) || !separated ||
        !conditional_macro_word(lexer, &condition, escaped) || !conditional_macro_next_line(lexer, &escaped)) return false;
    if (!conditional_macro_marker_line(lexer, &escaped)) return false;
    memset(directive, 0, sizeof(directive));
    command = (MacroName){.word = directive, .capacity = sizeof(directive) - 1, .ascii = true};
    if (!conditional_macro_directive(lexer, &command) || !command.ascii || strcmp(directive, "endif") != 0)
        return false;
    if (!conditional_macro_spacing(lexer, &separated, &escaped)) return false;
    return !escaped && (lexer->eof(lexer) || lexer->lookahead == '\n' || lexer->lookahead == '\r');
}

static bool conditional_macro_marker_line(TSLexer *lexer, bool *escaped) {
    char word[FUNCTION_MACRO_KEYWORD_MAX_LENGTH + 1] = {0};
    MacroName marker = {.word = word, .capacity = sizeof(word) - 1, .ascii = true};
    if (!conditional_macro_word(lexer, &marker, *escaped) ||
        (marker.ascii && function_macro_keyword(word))) return false;
    return conditional_macro_next_line(lexer, escaped);
}

static bool conditional_macro_directive(TSLexer *lexer, MacroName *name) {
    if (lexer->lookahead != '#') return false;
    lexer->advance(lexer, false);
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t') lexer->advance(lexer, false);
    return conditional_macro_word(lexer, name, false);
}

static bool conditional_macro_next_line(TSLexer *lexer, bool *escaped) {
    bool separated = false;
    *escaped = false;
    if (!conditional_macro_spacing(lexer, &separated, escaped) || *escaped ||
        !scan_preproc_newline(lexer, false)) return false;
    for (;;) {
        if (!conditional_macro_spacing(lexer, &separated, escaped) || lexer->eof(lexer)) return false;
        if (*escaped || !scan_preproc_newline(lexer, false)) return true;
    }
}

static bool conditional_macro_spacing(TSLexer *lexer, bool *separated, bool *escaped) {
    while (lexer->lookahead != '\n' && lexer->lookahead != '\r') {
        int32_t c = lexer->lookahead;
        if (pragma_space(c)) {
            *separated = true;
            lexer->advance(lexer, false);
            continue;
        }
        if (c == '/') {
            *separated = true;
            if (!function_macro_argument_slash(lexer, false)) return false;
            continue;
        }
        if (c != '\\') return true;
        lexer->advance(lexer, false);
        if (scan_preproc_newline(lexer, false)) continue;
        *escaped = lexer->lookahead == 'u' || lexer->lookahead == 'U';
        return *escaped;
    }
    return true;
}

static bool conditional_macro_word(TSLexer *lexer, MacroName *name, bool escaped) {
    bool has_name = escaped;
    if (escaped) {
        name->ascii = false;
        if (!scan_macro_name_ucn(lexer)) return false;
    }
    for (;;) {
        MacroNameCharacter character = scan_macro_name_character(lexer, has_name, name);
        if (character == MACRO_NAME_END) return has_name;
        if (character == MACRO_NAME_SPLICE) {
            return has_name && lexer->lookahead != '\\' && !preproc_word(lexer->lookahead, true);
        }
        if (character != MACRO_NAME_CHARACTER) return false;
        has_name = true;
    }
}

#endif
