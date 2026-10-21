#define RET(T) T
#define PARAMS(args) args
#define CONST const
#define DEPRECATED(...)
typedef int tag_t;
typedef struct Item Item;
struct Pair { int value; };
RET(tag_t) previous PARAMS((
    CONST Item *item,
    struct Pair *pair )) DEPRECATED(V0, V1, V2, V3, "use replacement");
typedef int (*saved_t) PARAMS((
    Item *item,
    void *data )) DEPRECATED(V0, V1, V2, V3, "use replacement");
int after(void) { return 0; }
