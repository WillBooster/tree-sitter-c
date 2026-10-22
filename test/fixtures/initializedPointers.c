#define SLOT(pointer) (*(pointer))
typedef double Scalar;
struct Holder { Scalar *value; };
Scalar *get(void);
Scalar *selectValue(Scalar value);
struct Holder *selectHolder(Scalar value);
void consume(Scalar value);
void example(Scalar in[], struct Holder *holder) {
  Scalar (*pointer) = in;
  Scalar (((*nested))) = in;
  Scalar *(*pointerToPointer) = &pointer;
  Scalar (*const qualified) = in;
  Scalar (*p) = in, (*q) = in;
  (*pointer) = 1;
  (holder->value) = in;
  holder->value[0] = 2;
  *get() = 3;
  selectValue(*pointer)[0] = 4;
  selectHolder(*pointer)->value = in;
  SLOT(pointer) = 5;
  SLOT(pointer) += 1;
  consume((*pointer));
  consume(*get());
}
