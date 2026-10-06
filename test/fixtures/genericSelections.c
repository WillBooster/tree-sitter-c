int choose(int value, double decimal) {
  int direct = _Generic(value, int: value, default: 0);
  int nested = _Generic(value, int: _Generic(decimal, double: value + 1, default: 0), default: 0);
  const char* text = "_Generic(value, int: 1, default: 0)";
  int _GenericCount = 1;
  // _Generic(value, int: 1, default: 0) remains comment text.
  return direct + nested + _GenericCount + text[0];
}
int main(void) { return choose(1, 2.0) == 0; }
