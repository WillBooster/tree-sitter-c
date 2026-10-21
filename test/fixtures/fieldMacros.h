#ifndef HEADER_H
#define HEADER_H
struct Item {
  int first;
  EXTRA_FIELDS
};
typedef struct Buffer {
  char *data;
  unsigned long size;
} Buffer;
typedef int File;
#define PRIVATE_FIELDS int extra;
struct Other { PRIVATE_FIELDS };
#endif
