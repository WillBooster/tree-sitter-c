enum Sized : unsigned const { A };
enum Multiple : unsigned long volatile { B };
enum Primitive : int const { C };
enum TypeOf : typeof(1) const { D };
enum : unsigned const { E };
enum Prefix : const unsigned { F };
static long const;
const static unsigned;
struct Bits {
  unsigned const : 3;
  unsigned const named : 2;
  int x;
};
void parameter(unsigned const);
typedef long const Alias;
void contexts(void) {
  static long const;
  int y;
  const static unsigned;
  int z;
  for (long const;;) { break; }
  for (unsigned int const;;) { break; }
  for (long const value = 0; value < 1;) { break; }
  unsigned const ordinary = 1;
  (void)(unsigned const)ordinary;
  (void)sizeof(long const);
}
int following(void) { return 0; }
