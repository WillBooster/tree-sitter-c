int calculate(int a, int b) {
  a /= b; a %= b; a *= b; a <<= 1; a >>= 1; a &= b; a |= b; a ^= b;
  int result = a / b + a % b + (a <= b) + (a >= b) + (a << 1) + (a >> 1) + (a | b) + (a ^ b) + (~a) + (!a);
  const char* operators = "/= %= *= <<= >>= &= |= ^= / % <= >= << >> | ^ ~ !";
  // /= %= *= <<= >>= &= |= ^= / % <= >= << >> | ^ ~ ! remain comment text.
  return result + operators[0];
}
int main(void) { return calculate(7, 3) == 0; }
