struct Flags { unsigned enabled : 1; unsigned reserved : 7; };
int choose(int a, int b, int c) {
  int longChoice = c;
  int selected = a ? b : (b ? c : a);
  int nested = (a ? b : c) ? c : b;
  int sequence = a ? (b += 1, c) : b;
  int generic = _Generic(a, int : b, default : c);
  const char* punctuation = "? :";
  // ? : remain comment text, not conditional operators.
  if (selected) goto done;
done:
  return selected + nested + sequence + generic + punctuation[0] + longChoice;
}
int main(void) { return choose(1, 2, 3) == 0; }
