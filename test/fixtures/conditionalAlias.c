#define MARK
typedef int Result;
#ifdef A
MARK
#endif
Result alias(void) { return 0; }
#ifdef A
MARK
#endif
static void timer(void) {}
int after(void) { return 0; }
static Result
#ifdef A
MARK
#endif
postAlias(void) { return 0; }
Result
#ifndef B
MARK
#endif
aliasPrototype(void);
int followingAlias(void) { return 0; }
