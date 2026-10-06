int travel(int value) {
  const char* words = "goto done retry";
  int gotoCount = 0;
  // goto done and goto retry remain comment text.
retry:
  if (value < 0) goto done;
  if (value > 1) { value--; goto retry; }
done:
  return value + gotoCount + words[0];
}
int main(void) { return travel(2) == 0; }
