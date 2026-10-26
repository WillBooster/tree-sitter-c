int static long global;
unsigned static _BitInt(17) bits;
_Atomic(unsigned long) atomicValue;
typeof(int const long) typeOfValue;
enum E : unsigned long { A };
struct Member { int const long member; };

long contexts(int register long argument) {
  long register int local = argument;
  local += (unsigned const long)1;
  local += sizeof(int const long);
  local += _Alignof(unsigned const long);
  local += _Generic(1L, int long: 1);
  local += (int const long){1};
  return local;
}
int following(void) { return 0; }
