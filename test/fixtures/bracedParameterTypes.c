#define MARK
#define OTHER
#define TYPE(...) __VA_ARGS__
typedef int Result;
int anonymous(struct { int x; } *p);
int named(struct Named { int x; } p) { return p.x; }
Result enumerated(enum { ENUM_A, ENUM_B } e);
int array_bound(int a[sizeof(struct { int q; })]);
int callback(int (*cb)(struct { int z; } *), int y);
int attributed(struct { int a; } s) __attribute__((unused));
extern MARK TYPE(struct { int member; }) object;
MARK extern OTHER const TYPE(struct { int member; }) qualified;
extern TYPE(struct { int member; }) opaque(void) { for (;;) {} }
extern TYPE(int) macro_parameter(struct { int nested; } *p);
int following(void) { return 0; }
