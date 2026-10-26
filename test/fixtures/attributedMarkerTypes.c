#define MARK
#define OTHER
#define TYPE(...) __VA_ARGS__
MARK __attribute__((unused)) TYPE(struct { int member; }) between;
MARK __attribute__((unused)) TYPE(struct { int member; }) between_initialized = {1};
MARK [[maybe_unused]] TYPE(struct { int member; }) bracketed;
MARK [[maybe_unused]] TYPE(struct { int member; }) bracketed_initialized = {2};
__attribute__((unused)) MARK TYPE(struct { int member; }) leading;
__attribute__((unused)) MARK TYPE(struct { int member; }) leading_initialized = {3};
MARK __declspec(align(16)) TYPE(struct { int member; }) microsoft;
MARK __declspec(align(16)) TYPE(struct { int member; }) microsoft_initialized = {4};
MARK __attribute__((annotate("{;}"))) OTHER TYPE(struct { int member; }) quoted;
MARK __attribute__((annotate("{;}"))) OTHER TYPE(struct { int member; }) quoted_initialized = {5};
MARK __attribute__((aligned(sizeof(struct { int member; })))) TYPE(struct { int member; }) aligned = {6};
int next(void);
int following(void) { return 0; }
