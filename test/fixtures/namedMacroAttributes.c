#define ATTR(...)
int ATTR(int a[sizeof(struct { int member; })]) value = {0};
int ATTR(int a[sizeof(struct { int member; })]) first = {1}, second = {2};
int ATTR(register int a[sizeof(struct { int member; })]) registered = {3};
int ATTR(int a[sizeof(struct { int member; })] __attribute__((unused))) attributed = {4};
int ordinary(register int a[sizeof(struct { int member; })]);
int ordinary_definition(register int a[sizeof(struct { int member; })]) { return 0; }
int next(void);
int following(void) { return 0; }
