#define ATTR(...)
#define TYPE(...) __VA_ARGS__
extern ATTR((int[]){1}) TYPE(int) prototype(void);
extern ATTR(struct { int member; }) TYPE(int) object;
static ATTR((int[]){1}) TYPE(int) initialized = 1;
extern ATTR((int[]){1}) TYPE(int) *pointer(void);
static ATTR((int[]){1}) TYPE(int) definition(void) { return 0; }
int next(void);
int following(void) { return 0; }
