#define DECLARE(...) int generated = 0
static DECLARE(foo, {1, 2});
int global_next = 1;
int block(void) {
  static DECLARE(foo, {1, 2});
  int next = 1;
  return next;
}
int nested(void) {
  {
    const DECLARE(foo, {1, 2});
    int next = 2;
  }
  return 0;
}
void loop(void) {
  for (const DECLARE(foo, {1, 2}); ; ) { break; }
  int next = 3;
}
int next(void);
int following(void) { return 0; }
