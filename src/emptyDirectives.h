#ifndef TREE_SITTER_C_EMPTY_DIRECTIVES_H_
#define TREE_SITTER_C_EMPTY_DIRECTIVES_H_

#include "pragma.h"
#include <stdlib.h>

typedef struct {
    int32_t value;
    uint32_t byte;
} DirectiveCharacter;

typedef struct {
    DirectiveCharacter *characters;
    uint8_t *condition_ends;
    uint32_t length, index, end;
} DirectiveInput;

typedef struct {
    uint8_t *starts, *ends;
    uint32_t bytes;
    bool built, ready;
} EmptyDirectives;

typedef enum { DIRECTIVE_ORDINARY, DIRECTIVE_CONDITION, DIRECTIVE_DIAGNOSTIC, DIRECTIVE_REQUIRED } DirectiveKind;

typedef struct {
    bool beginning, pending, operand;
    DirectiveKind kind;
    uint32_t start;
} DirectiveLine;

static void directive_prefixes(EmptyDirectives *state, const DirectiveInput *input);
static bool directive_append(DirectiveInput *input, uint32_t *capacity, TSLexer *lexer);
static void directive_line_end(EmptyDirectives *state, DirectiveInput *input, DirectiveLine *line);
static void directive_line_character(EmptyDirectives *state, DirectiveInput *input, DirectiveLine *line, int32_t c);
static void directive_code(EmptyDirectives *state, DirectiveInput *input, DirectiveLine *line, int32_t c);
static void directive_line_comment(EmptyDirectives *state, DirectiveInput *input, DirectiveLine *line);
static uint32_t directive_splice_end(const DirectiveInput *input);

static bool empty_directives_build(EmptyDirectives *state, TSLexer *lexer);
static void empty_directives_find(EmptyDirectives *state, DirectiveInput *input);
static int32_t directive_next(DirectiveInput *input);
static int32_t directive_peek(const DirectiveInput *input);
static bool directive_comment(DirectiveInput *input, bool *line);
static bool directive_quoted(DirectiveInput *input, int32_t quote);
static bool directive_raw(DirectiveInput *input);
typedef struct {
    GnuRawStringPrefix raw;
    char directive[13];
    unsigned length;
} DirectiveWord;

static DirectiveKind directive_word(DirectiveInput *input, int32_t first, bool raw);
static DirectiveKind directive_word_kind(const DirectiveWord *word);
static void directive_word_character(DirectiveWord *word, int32_t c);
static bool directive_horizontal(int32_t c);
static bool directive_newline(int32_t c);
static uint32_t directive_byte(const DirectiveInput *input);
static void directive_record(EmptyDirectives *state, uint32_t start, uint32_t end);

static bool empty_directives_initialize(EmptyDirectives *state, TSLexer *lexer) {
    TSLexerCheckpoint start;
    lexer->get_checkpoint(lexer, &start);
    if (!state->built) {
        state->built = true;
        empty_directives_build(state, lexer);
    }
    state->ready = true;
    lexer->mark_end_at(lexer, &start);
    return true;
}

static bool empty_directives_consume(TSLexer *lexer, EmptyDirectives *state, bool skip_prefix);

static bool empty_directives_skip(TSLexer *lexer, void *payload) {
    return empty_directives_consume(lexer, payload, false);
}

static bool empty_directives_consume(TSLexer *lexer, EmptyDirectives *state, bool skip_prefix) {
    if (!state || !state->starts) return false;
    TSLexerPosition position;
    lexer->get_position(lexer, &position);
    if (position.bytes >= state->bytes || !(state->starts[position.bytes / 8] & (1u << (position.bytes % 8)))) return false;
    while (lexer->lookahead != '#' && !lexer->eof(lexer)) lexer->advance(lexer, skip_prefix);
    do {
        lexer->advance(lexer, false);
        lexer->get_position(lexer, &position);
    } while (!lexer->eof(lexer) && position.bytes < state->bytes &&
        !(state->ends[position.bytes / 8] & (1u << (position.bytes % 8))));
    return true;
}

static bool empty_directives_build(EmptyDirectives *state, TSLexer *lexer) {
    DirectiveInput input = {0};
    uint32_t capacity = 0;
    while (!lexer->eof(lexer)) {
        if (!directive_append(&input, &capacity, lexer)) goto failed;
        lexer->advance(lexer, false);
    }
    TSLexerPosition end;
    lexer->get_position(lexer, &end);
    input.end = end.bytes;
    state->bytes = end.bytes;
    state->starts = calloc((size_t)state->bytes / 8 + 1, 1);
    state->ends = calloc((size_t)state->bytes / 8 + 1, 1);
    input.condition_ends = calloc((size_t)state->bytes / 8 + 1, 1);
    if (!state->starts || !state->ends || !input.condition_ends) goto failed;
    empty_directives_find(state, &input);
    directive_prefixes(state, &input);
    free(input.condition_ends);
    free(input.characters);
    return true;
failed:
    free(input.condition_ends);
    free(input.characters);
    free(state->starts);
    free(state->ends);
    state->starts = state->ends = NULL;
    return false;
}

static void directive_prefixes(EmptyDirectives *state, const DirectiveInput *input) {
    bool prefix = false;
    for (uint32_t i = input->length; i > 0; i--) {
        DirectiveCharacter character = input->characters[i - 1];
        bool hash = character.value == '#' && (state->starts[character.byte / 8] & (1u << (character.byte % 8)));
        bool condition_end = input->condition_ends[character.byte / 8] & (1u << (character.byte % 8));
        prefix = !condition_end && (hash || (prefix && (pragma_space(character.value) || character.value == '\\')));
        if (prefix) state->starts[character.byte / 8] |= 1u << (character.byte % 8);
    }
}

static bool directive_append(DirectiveInput *input, uint32_t *capacity, TSLexer *lexer) {
    if (input->length == *capacity) {
        uint32_t next = *capacity ? *capacity * 2 : 1024;
        if (next < *capacity || (size_t)next > SIZE_MAX / sizeof(*input->characters)) return false;
        void *characters = realloc(input->characters, (size_t)next * sizeof(*input->characters));
        if (!characters) return false;
        input->characters = characters;
        *capacity = next;
    }
    TSLexerPosition position;
    lexer->get_position(lexer, &position);
    input->characters[input->length++] = (DirectiveCharacter){lexer->lookahead, position.bytes};
    return true;
}

static void empty_directives_find(EmptyDirectives *state, DirectiveInput *input) {
    DirectiveLine line = {.beginning = true};
    while (input->index < input->length) {
        int32_t c = directive_next(input);
        if (c < 0) break;
        directive_line_character(state, input, &line, c);
    }
    if (line.pending) directive_record(state, line.start, input->end);
}

static void directive_line_character(EmptyDirectives *state, DirectiveInput *input, DirectiveLine *line, int32_t c) {
    if (c == '\n') {
        directive_line_end(state, input, line);
        return;
    }
    if (c == '/' && (directive_peek(input) == '/' || directive_peek(input) == '*')) {
        directive_line_comment(state, input, line);
        return;
    }
    if (directive_horizontal(c) || (line->beginning && pragma_space(c))) return;
    if (c == '#' && line->beginning) {
        line->start = input->characters[input->index - 1].byte;
        line->beginning = false;
        line->pending = true;
        return;
    }
    directive_code(state, input, line, c);
}

static void directive_code(EmptyDirectives *state, DirectiveInput *input, DirectiveLine *line, int32_t c) {
    bool name = line->pending;
    if (!name) line->operand = true;
    line->beginning = line->pending = false;
    if (c == '"' || c == '\'') {
        if (directive_quoted(input, c)) directive_line_end(state, input, line);
    } else if (preproc_word(c, false) || (c >= '0' && c <= '9')) {
        DirectiveKind kind = directive_word(input, c, line->kind != DIRECTIVE_DIAGNOSTIC);
        if (name) line->kind = kind;
    }
}

static void directive_line_comment(EmptyDirectives *state, DirectiveInput *input, DirectiveLine *line) {
    bool single = false;
    if (!directive_comment(input, &single)) line->pending = false;
    if (single) directive_line_end(state, input, line);
}

static void directive_line_end(EmptyDirectives *state, DirectiveInput *input, DirectiveLine *line) {
    if (line->pending) directive_record(state, line->start, directive_byte(input));
    line->beginning = true;
    line->pending = false;
    bool required = line->kind == DIRECTIVE_CONDITION || (line->kind == DIRECTIVE_REQUIRED && !line->operand);
    if (required && input->index &&
        directive_newline(input->characters[input->index - 1].value)) {
        uint32_t byte = input->characters[input->index - 1].byte;
        input->condition_ends[byte / 8] |= 1u << (byte % 8);
    }
    line->kind = DIRECTIVE_ORDINARY;
    line->operand = false;
}

static int32_t directive_next(DirectiveInput *input) {
    while (input->index < input->length) {
        int32_t c = input->characters[input->index++].value;
        if (c == '\\') {
            uint32_t after = directive_splice_end(input);
            if (after != input->index) {
                input->index = after;
                continue;
            }
        }
        if (directive_newline(c)) {
            if (input->index < input->length && directive_newline(input->characters[input->index].value) &&
                input->characters[input->index].value != c) input->index++;
            return '\n';
        }
        return c;
    }
    return -1;
}

static uint32_t directive_splice_end(const DirectiveInput *input) {
    uint32_t after = input->index;
    while (after < input->length && directive_horizontal(input->characters[after].value)) after++;
    if (after == input->length || !directive_newline(input->characters[after].value)) return input->index;
    int32_t newline = input->characters[after++].value;
    if (after < input->length && directive_newline(input->characters[after].value) &&
        input->characters[after].value != newline) after++;
    return after;
}

static int32_t directive_peek(const DirectiveInput *input) {
    DirectiveInput copy = *input;
    return directive_next(&copy);
}

static bool directive_comment(DirectiveInput *input, bool *line) {
    *line = directive_next(input) == '/';
    int32_t previous = 0;
    while (input->index < input->length) {
        int32_t c = directive_next(input);
        if (*line && c == '\n') return true;
        if (!*line && previous == '*' && c == '/') return true;
        previous = c;
    }
    return *line;
}

static bool directive_quoted(DirectiveInput *input, int32_t quote) {
    while (input->index < input->length) {
        int32_t c = directive_next(input);
        if (c == quote) return false;
        if (c == '\\') c = directive_next(input);
        if (c == '\n') return true;
        if (c < 0) return false;
    }
    return false;
}

static DirectiveKind directive_word(DirectiveInput *input, int32_t first, bool raw) {
    DirectiveWord word = {0};
    directive_word_character(&word, first);
    bool number = first >= '0' && first <= '9';
    int32_t previous = first;
    for (;;) {
        int32_t c = directive_peek(input);
        bool exponent_sign = number && (c == '+' || c == '-') &&
            (previous == 'e' || previous == 'E' || previous == 'p' || previous == 'P');
        if (!preproc_word(c, true) && !(number && (c == '.' || c == '\'' || exponent_sign))) break;
        previous = directive_next(input);
        directive_word_character(&word, previous);
    }
    if (raw && gnu_raw_string_prefix(&word.raw) && directive_peek(input) == '"') directive_raw(input);
    return directive_word_kind(&word);
}

static DirectiveKind directive_word_kind(const DirectiveWord *word) {
    if (word->length >= sizeof word->directive) return DIRECTIVE_ORDINARY;
    if (strcmp(word->directive, "if") == 0 || strcmp(word->directive, "elif") == 0) return DIRECTIVE_CONDITION;
    if (strcmp(word->directive, "warning") == 0 || strcmp(word->directive, "error") == 0) return DIRECTIVE_DIAGNOSTIC;
    static const char *const required[] = {
        "define", "ifdef", "ifndef", "elifdef", "elifndef", "include", "include_next", "embed", "undef", "line",
    };
    for (unsigned i = 0; i < sizeof required / sizeof *required; i++) {
        if (strcmp(word->directive, required[i]) == 0) return DIRECTIVE_REQUIRED;
    }
    return DIRECTIVE_ORDINARY;
}

static void directive_word_character(DirectiveWord *word, int32_t c) {
    gnu_raw_string_prefix_character(&word->raw, c);
    if (word->length < sizeof word->directive - 1 && c > 0 && c < 128) {
        word->directive[word->length++] = (char)c;
    } else {
        word->length = sizeof word->directive;
    }
}

static bool directive_raw(DirectiveInput *input) {
    DirectiveInput candidate = *input;
    directive_next(&candidate);
    int32_t delimiter[16];
    unsigned length = 0;
    int32_t c;
    while ((c = directive_next(&candidate)) != '(') {
        if (length == 16 || c < 0x21 || c > 0x7e || c == ')' || c == '\\') return false;
        delimiter[length++] = c;
    }
    while (candidate.index < candidate.length) {
        uint32_t index = candidate.index++;
        if (candidate.characters[index].value != ')' || candidate.length - index < length + 2) continue;
        unsigned matched = 0;
        while (matched < length && candidate.characters[index + 1 + matched].value == delimiter[matched]) matched++;
        if (matched == length && candidate.characters[index + 1 + length].value == '"') {
            candidate.index = index + length + 2;
            break;
        }
    }
    *input = candidate;
    return true;
}

static bool directive_horizontal(int32_t c) {
    return c == ' ' || c == '\t' || c == '\v' || c == '\f';
}

static bool directive_newline(int32_t c) {
    return c == '\n' || c == '\r';
}

static uint32_t directive_byte(const DirectiveInput *input) {
    return input->index < input->length ? input->characters[input->index].byte : input->end;
}

static void directive_record(EmptyDirectives *state, uint32_t start, uint32_t end) {
    state->starts[start / 8] |= 1u << (start % 8);
    state->ends[end / 8] |= 1u << (end % 8);
}

#endif
