long static int x;
int static long y;
signed static char z;
unsigned const int qualified;
const int static long inline long volatile function(void) { return 0; }
struct Holder { unsigned const long field; };
typedef unsigned const long int Alias;
unsigned static _BitInt(17) bitValue;
int after(register unsigned const int argument) {
  unsigned register long local = argument;
  return (unsigned const long)local + sizeof(unsigned const long);
}
int static ordinary;
long const untyped;
