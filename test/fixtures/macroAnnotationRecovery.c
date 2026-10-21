#define ATTR(x) __attribute__((unused))
extern ATTR(1) int (parenthesized)(void);
extern ATTR(2) int (*factory(void))(int);
extern ATTR(3) int ((nested))(int);
int following(void) { return 0; }
