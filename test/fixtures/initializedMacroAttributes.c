#define TYPE(...) __VA_ARGS__
#define ATTR(...)
#define LAST
#define MARK
#define OTHER
#define DECL(...) guarded
struct S { int x; };
int DECL(struct { int member; }) = 0;
static TYPE(int) ATTR(struct { int member; }) value = 0;
static TYPE(int) ATTR(struct { int member; }) *pointer = 0;
static TYPE(int) ATTR(struct { int member; }) first = 0, second = 1;
static TYPE(int) ATTR(struct { int member; }) plain;
static TYPE(int) ATTR(struct { int member; }) prototype(void);
TYPE(int) (*callback)(void) LAST = 0;
MARK int ATTR(struct { int member; }) marked = 0;
MARK TYPE(int) ATTR(struct { int member; }) marked_type = 0;
MARK static int ATTR(struct { int member; }) marked_storage = 0;
static MARK int ATTR(struct { int member; }) storage_marked = 0;
MARK int ATTR(struct { int member; }) OTHER trailing_marked = {0};
MARK OTHER int ATTR(struct { int member; }) OTHER trailing_several = {0};
static MARK int ATTR(struct { int member; }) OTHER trailing_storage = {0};
MARK TYPE(int) ATTR(struct { int member; }) OTHER trailing_type = {0};
MARK OTHER TYPE(int) ATTR(struct { int member; }) OTHER trailing_several_type = {0};
MARK struct S ATTR(struct { int member; }) OTHER trailing_tag = {0};
static MARK struct S ATTR(struct { int member; }) OTHER trailing_storage_tag = {0};
int next(void);
int following(void) { return 0; }
