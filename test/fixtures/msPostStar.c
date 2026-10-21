int * __stdcall declared(void);
int * __stdcall defined(void) { return 0; }
typedef int * __stdcall Callback(void);
typedef int * __stdcall (*CallbackPointer)(void);
typedef int (* __stdcall InnerCallback)(void);
struct Holder { int * __stdcall (*factory)(void); int (* __stdcall callback)(void); };
void consume(int * __stdcall callback(void));
int size(void) { return sizeof(int * __stdcall (*)(void)); }
void convert(void) { (void)(int * __stdcall (*)(void))0; }
int * const __stdcall qualified(void);
int * __stdcall const reversed(void);
int ** __stdcall nested(void);
int * __stdcall old(a) int a; { return 0; }
void pointerConsume(int (* __stdcall cb)(void));
int abstractSize(void) { return sizeof(int (* __stdcall)(void)); }
void abstractConvert(void) { (void)(int (* __stdcall)(void))0; }
int after(void) { return 0; }
