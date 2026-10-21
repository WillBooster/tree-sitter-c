#define PACKED
#ifdef ANNOTATE
PACKED
#endif
struct Record { int value; };
#ifdef ANNOTATE
PACKED
#endif
union Number { int integer; float real; };
#ifdef ANNOTATE
PACKED
#endif
enum Choice { FIRST, SECOND };
#ifdef ANNOTATE
PACKED
#endif
struct Forward;
int after(void) { return 0; }
