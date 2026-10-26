#define TYPE(...) __VA_ARGS__
#define ATTR(...)
#define LAST
#define DECL(...) guarded
int DECL(struct { int member; }) = 0;
static TYPE(int) ATTR(struct { int member; }) value = 0;
static TYPE(int) ATTR(struct { int member; }) *pointer = 0;
static TYPE(int) ATTR(struct { int member; }) first = 0, second = 1;
static TYPE(int) ATTR(struct { int member; }) plain;
static TYPE(int) ATTR(struct { int member; }) prototype(void);
TYPE(int) (*callback)(void) LAST = 0;
int next(void);
int following(void) { return 0; }
