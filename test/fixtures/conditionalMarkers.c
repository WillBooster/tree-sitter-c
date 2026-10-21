#define HEADER_MARKER
#if ENABLE
#ifdef ANNOTATE
HEADER_MARKER
#endif
void timer(int code) {
  (void)code;
}
#endif
int after(void) { return 0; }
