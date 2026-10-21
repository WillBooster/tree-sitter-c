extern __printf(2, 3) int sprintf(char *buf, const char *fmt, ...);
extern __printf(2, 0) int vsprintf(char *buf, const char *fmt, va_list);
extern __printf(3, 4)
int snprintf(char *buf, size_t size, const char *fmt, ...);
result_t DEPRECATED(7.56.0, "Use append")
append(struct Item **first, struct Item **last, ...);
extern CHECK_TYPES(int, int (*)(int), (1 + 2), "comma,inside", WRAP(1, 2)) int typed(void);
extern EMPTY(, 1, ,) int empty_args(void);
typedef size_t (*callback_t)(void *arg, const char *buf, size_t len);
int following(void) { return 0; }
