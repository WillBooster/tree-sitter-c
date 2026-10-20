struct Value { int amount; };
int calculate(int a, int b) {
  a /= b; a %= b; a *= b; a <<= 1; a >>= 1; a &= b; a |= b; a ^= b;
  int result = a / b + a % b + (a <= b) + (a >= b) + (a << 1) + (a >> 1) + (a | b) + (a ^ b) + (~a) + (!a);
  const char* operators = "/= %= *= <<= >>= &= |= ^= / % <= >= << >> | ^ ~ ! . ->";
  // /= %= *= <<= >>= &= |= ^= / % <= >= << >> | ^ ~ ! . -> remain comment text.
  return result + operators[0];
}
int main(void) {
  struct Value value = {.amount = 7};
  struct Value *pointer = &value;
  union { int integer; float real; } number = {.integer = 3};
  return calculate(value.amount, pointer->amount) + number.integer;
}
