#define ATTR(...)
typedef int Result;
extern ATTR((int[]){1}) Result g(void);
extern ATTR(struct { int member; }) Result object;
static ATTR((int[]){1}) Result initialized = 1;
extern ATTR((int[]){1}) const Result *pointer(void);
extern ATTR((int[]){1}) ATTR("literal") Result chained(void);
static ATTR((int[]){1}) Result definition(void) { return 0; }
void block(void) {
  extern ATTR((int[]){1}) Result local(void);
  static ATTR((int[]){1}) Result value = 0;
  int next = value;
}
int following(void) { return 0; }
