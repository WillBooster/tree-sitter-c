#define UNUSED __attribute__((unused))
#define OTHER_ATTR(...) __attribute__((unused))
typedef struct Context Context;
static inline void gnu(Context *UNUSED p) __attribute__((unused)) {}
static inline void short_gnu(Context *UNUSED p) __attribute((unused)) {}
static inline void macro(Context *UNUSED p) OTHER_ATTR(1, "(") {}
static inline void standard(Context *UNUSED p) [[]] {}
static inline __declspec(noinline) void microsoft(Context *UNUSED p) {}
int assembler(Context *UNUSED p) __asm__("assembler");
int following(void) { return 0; }
