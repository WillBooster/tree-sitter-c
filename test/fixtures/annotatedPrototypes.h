#define BOUNDS(...)
#define CHECK
#define SIZE(...)
#define AVAILABLE(...)
#define UNSAFE
typedef unsigned long size_t;
typedef unsigned long id_t;
typedef struct Zone zone_t;
#ifndef GUARD
#if defined(__LP64__)  
#ifndef NO_ATTRS
void * BOUNDS(size) first(size_t size, id_t type_id) CHECK SIZE(1);
AVAILABLE(first(14.0), two(17.0), four(17.0), seventh(10.0), eighthxx(1.0), ninthxxxx(23.0))
AVAILABLE(first(14.0), two(17.0), four(17.0), seventh(10.0), eighthxx(1.0), ninthxxxx(23.0))
AVAILABLE(first(14.0), two(17.0), four(17.0), seventh(10.0), eighthxx(1.0), ninthxxxx(23.0))
AVAILABLE(first(14.0), two(17.0), four(17.0), seventh(10.0), eighthxx(1.0), ninthxxxx(23.0))
void * BOUNDS(1) allocate(void) CHECK SIZE(1);
void  release(void);
#endif
#endif
#endif
