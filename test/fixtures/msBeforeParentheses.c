typedef int __stdcall (*Callback)(int);
typedef int __stdcall (*CallbackArray[2])(int);
struct Holder { int __stdcall (*callback)(int); };
void consume(int __stdcall (*cb)(int));
void nested(int __stdcall (*(*factory)(void))(int));
int size(void) { return sizeof(int __stdcall (*)(int)); }
void convert(void) { (void)(int __stdcall (*)(int))0; }
int __stdcall (prototype)(void);
int __stdcall (defined)(void) { return 0; }
int __stdcall (*object)(int);
int after(void) { return 0; }
