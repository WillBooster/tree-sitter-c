#define MARK
#define OTHER
#define TYPE(...) __VA_ARGS__
#define ANNOTATE(...)
typedef int Word;
MARK TYPE(struct { int member; }) single;
MARK OTHER TYPE(union { int member; }) several;
MARK MARK MARK TYPE(enum { ONE }) enumeration;
MARK TYPE(struct { int member; }) *pointer;
MARK const TYPE(struct { int member; }) qualified;
MARK TYPE(int) unbraced;
MARK /* prefix */ OTHER
TYPE(struct { int member; }) spaced;
_Pragma(/* before */ "STDC FP_CONTRACT ON") MARK TYPE(struct { int member; }) pragma_before;
MARK _Pragma(/* between */ "STDC FP_CONTRACT ON") TYPE(struct { int member; }) pragma_between;
MARK OTHER _Pragma("STDC FP_CONTRACT ON") TYPE(struct { int member; }) pragma_later;
MARK _Pragma("STDC FP_CONTRACT ON") /* suffix */ TYPE(struct { int member; }) pragma_after;
Word ANNOTATE((int[]){1}) expression;
Word ANNOTATE(int, (int[]){1}) typed_annotation;
int next(void);
int following(void) { return 0; }
