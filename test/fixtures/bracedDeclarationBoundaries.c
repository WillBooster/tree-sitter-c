#define SECTION(...)
#define DEFINE_THING(...) int thing
#define DEFINE_PAIR(...) int paired
int SECTION({1}) post_body(void) { return 0; }
static int SECTION((int[]){1}) typed_body(void) { return 0; }
static SECTION((int[]){1}) int leading_body(void) { return 0; }
int SECTION(({ int value = 1; value; })) statement_body(void) { return 0; }
int SECTION((int[]){1}) SECTION((int){2}) chain_body(void) { return 0; }
static DEFINE_THING({1});
int next;
static DEFINE_PAIR(foo, {.a = 1});
int after_pair(void);
int following(void) { return 0; }
