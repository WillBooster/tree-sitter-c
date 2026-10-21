#define BUILD_PATH(name, path) const char *name(void) { return path; }
static BUILD_PATH(make_path, "path")
void following(void) {}
static BUILD_PATH(other_path, "other")
static int enabled(void) { return 1; }
static BUILD_PATH(third_path, "third")
const char *pointer(void) { return make_path(); }
int last(void) { return enabled(); }
