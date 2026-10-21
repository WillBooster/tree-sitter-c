#define UNUSED __attribute__((unused))
typedef struct Context Context;
static inline void discard(Context *context UNUSED) {}
int following(void) { return 0; }
