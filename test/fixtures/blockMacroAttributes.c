#define ATTR(...)
struct S { int member; };
void scalar(void) { int ATTR(struct { int member; }) x = 3; int z; }
void aggregate(void) { struct S ATTR(struct { int member; }) x = {0}; int z; }
void enumeration(void) { int ATTR(enum { ONE }) x = 1; int z; }
void measured(void) { int ATTR(sizeof(struct { int member; })) x = 3; int z; }
void loop(void) { for (int ATTR(struct { int member; }) i = 0; i < 2; i++) {} int z; }
int next(void);
int following(void) { return 0; }
