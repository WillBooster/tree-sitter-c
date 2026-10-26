#define FOO() extern int availability_marker;
#define A
#define B
#define C
#define D
FOO()
A B C const char x;
typedef int Word;
typedef Word Alias;
struct Opaque;
struct Holder { Word field; struct Opaque *pointer; };
Alias variable;
Alias *pointer;
Alias function(Word parameter);
Alias cast(Word parameter) {
  for (Alias index = parameter; index; index--) {}
  return (Alias)sizeof(Word *);
}
enum Named : Word { Member };
