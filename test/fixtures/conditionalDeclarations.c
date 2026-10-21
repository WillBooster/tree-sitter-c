#define MARK
#ifdef A
MARK
#endif
typedef int Before;
typedef
#ifdef A
MARK
#endif
int After;
#ifdef A
MARK
#endif
__attribute__((unused)) int marked(void) { return 0; }
#ifdef A
MARK
#endif
[[maybe_unused]] int square(void) { return 0; }
#ifdef A
MARK
#endif
_Pragma("GCC diagnostic push") int pragmatic(void) { return 0; }
#ifdef A
MARK
#endif
_Alignas(16) int aligned;
extern int
#ifdef A
MARK
#endif
f(void);
int g(void);
int h(int a);
void i(void) {}
