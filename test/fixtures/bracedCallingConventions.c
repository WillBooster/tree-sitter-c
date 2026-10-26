struct Plain;
int __stdcall stdcall(struct Std { int a; } x);
static int __cdecl cdecl(struct Decl { int a; } x);
void __stdcall anonymous(struct { int a; } x);
int __stdcall sized(int a[sizeof(struct { int q; })]);
int __stdcall callback(int (*cb)(struct { int z; } *), int y);
int __stdcall definition(struct Def { int a; } x) { return x.a; }
int __stdcall *pointer(struct Ptr { int a; } x);
int __stdcall plain(struct Plain *x);
int next(void);
int following(void) { return 0; }
