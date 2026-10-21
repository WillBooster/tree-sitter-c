#define UNUSED __attribute__((unused))
#define OTHER_ATTR(...) __attribute__((unused))
typedef struct Context Context;
static inline void gnu(Context *p UNUSED) __attribute__((unused)) {}
static inline void short_gnu(Context *p UNUSED) __attribute((unused)) {}
static inline void macro(Context *p UNUSED) OTHER_ATTR(1, "(") {}
static inline void standard(Context *p UNUSED) [[]] {}
static inline __declspec(noinline) void microsoft(Context *p UNUSED) {}
int assembler(Context *p UNUSED) __asm__("assembler");
int following(void) { return 0; }
