#define SECTION(...)
#define TYPE(...) __VA_ARGS__
#define MARK
#define OLD_FN(name, ...) name(value)
int outer(void) {
  int SECTION((int[]){1}) annotated(void) { return 0; }
  TYPE(int) typed(void) { return 1; }
  TYPE(struct { int member; } *) braced(void) { return 0; }
  MARK TYPE(struct { int member; } *) marked(void) { return 0; }
  int SECTION((int[]){1}) old_style(value)
  int value;
  { return value; }
  int OLD_FN(old_provided, {1})
  int value;
  { return value; }
  return annotated() + typed();
}
int following(void) { return 0; }
