#define TYPE(...) __VA_ARGS__
typedef int Word;
__attribute__((unused)) TYPE(struct { int member; }) gnu_object;
__attribute__((unused)) TYPE(struct { int member; }) gnu_initialized = {0};
__attribute__((unused)) TYPE(struct { int member; }) gnu_prototype(void);
__attribute__((unused)) TYPE(struct GNUResult { int member; }) gnu_definition(void) { return (struct GNUResult){0}; }
[[maybe_unused]] TYPE(struct { int member; }) c23_object;
[[maybe_unused]] TYPE(struct { int member; }) c23_initialized = {0};
[[maybe_unused]] TYPE(struct { int member; }) c23_prototype(void);
[[maybe_unused]] TYPE(struct C23Result { int member; }) c23_definition(void) { return (struct C23Result){0}; }
__attribute__((unused)) Word gnu_opaque;
[[maybe_unused]] Word c23_opaque;
void block(void) {
  __attribute__((unused)) TYPE(struct { int member; }) gnu_local = {0};
  [[maybe_unused]] TYPE(struct { int member; }) c23_local = {0};
  int next = 1;
  static TYPE(struct { int member; }) static_local;
  { static TYPE(struct { int member; }) nested_local; int nested_next; }
  for (const TYPE(struct { int member; }) item = {0}; ; ) { break; }
}
int next(void);
int following(void) { return 0; }
