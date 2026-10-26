#define ATTR(...)
int ATTR(int a[sizeof(struct { int member; })]) value = {0};
int ATTR(int a[sizeof(struct { int member; })]) first = {1}, second = {2};
int next(void);
int following(void) { return 0; }
