#define ARRAY(name, ...) name[] = __VA_ARGS__
#define NAME(name, ...) name
#define TYPE(...) __VA_ARGS__
#define ATTR(...)
#define FN(name, ...) name(void)
int ARRAY(global_values, {1, 2});
TYPE(struct { int member; }) after_type;
int ARRAY(first, {1, 2}), second = 3;
int NAME(initialized, {0}) = 4;
int ATTR(struct { int member; }) ordinary;
int ATTR(struct { int member; }) ordinary_initialized = 5;
int FN(provided, {1}) { return 0; }
int f(void) {
  int ARRAY(values, {1, 2});
  values[0] = 3;
  return values[1];
}
void loop(void) {
  for (int ARRAY(values, {1, 2}); values[0] < 3; values[0]++) {}
  int next = 1;
}
int next(void);
int following(void) { return 0; }
