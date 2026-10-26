long const;
unsigned volatile const;
unsigned int const;
int const;
long const named;
void qualifierOnly(void) {
  unsigned const;
  int const;
  unsigned int const;
  unsigned const next = 1;
}
int following(void) { return 0; }
