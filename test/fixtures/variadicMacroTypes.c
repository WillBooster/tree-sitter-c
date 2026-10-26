#define PICK(type, ...) type
#define ANNOTATE(...)
#define WRAP(...) (__VA_ARGS__)
typedef int Word;
extern PICK(int, {1}) value;
int next(void);
extern PICK(Word, {1, 2}) typed;
extern PICK(unsigned long, (unsigned long[]){1, 2}) wide;
extern PICK(int, WRAP((int[]){1, 2})) nested;
extern PICK(int, ({ int x = 1; x; })) statement;
extern PICK(int, /* } ) */ {.field = 1}, "};#") commented;
extern PICK(int, , {1},) empty;
extern Word ANNOTATE(int, (int[]){1, 2}) annotated;
extern ANNOTATE(int, "{") ANNOTATE((int[]){1}) int quoted_chain(void);
extern ANNOTATE(int, /* { */ 1) ANNOTATE((int[]){1}) int commented_chain(void);
int following(void) { return 0; }
