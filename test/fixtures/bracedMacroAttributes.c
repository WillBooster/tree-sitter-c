#define ANNOTATE(...)
#define WRAP(...) (__VA_ARGS__)
struct Pair { int left; int right; };
typedef int Word;
extern ANNOTATE((int[]){1, 2}) int array_argument(void);
extern ANNOTATE((struct Pair){.left = 1, .right = 2}) int aggregate_argument(void);
int ANNOTATE((Word){1}) post_type(void);
extern ANNOTATE(WRAP((int[]){1, 2}), "};#") int nested_argument(void);
extern ANNOTATE(({ int value = 1; value; })) int statement_argument(void);
extern ANNOTATE(struct Inline { int member; }) int inline_type(void);
extern ANNOTATE(1) ANNOTATE((int[]){1, 2}) int chained(void);
extern int ANNOTATE((int[]){1, 2}) ANNOTATE((struct Pair){1, 2}) repeated(void);
int following(void) { return 0; }
