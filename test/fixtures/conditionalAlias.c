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
