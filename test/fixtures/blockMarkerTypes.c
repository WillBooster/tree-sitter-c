#define MARK
#define TYPE(...) __VA_ARGS__
int scalar(void) { MARK TYPE(struct { int member; }) value = {1}; return value.member; }
int several(void) { MARK TYPE(struct { int member; }) value = {1}, other = {2}; return value.member + other.member; }
int array(void) { MARK TYPE(struct { int member; }) values[] = {{1}}; return values[0].member; }
int next(void);
int following(void) { return 0; }
