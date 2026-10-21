#define XX(n) case n: break;
static void run(void) {
int value = 0;
switch (value) {
XX(0)
XX(1)
XX(2)
XX(3)
XX(4)
default: break;
}
}
int following(void) {return 0;}
int last(void) {return 1;}
