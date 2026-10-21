static int f(const char *arg)
{
  BEGIN_TEST

  {
    struct dynbuf host;
    int x = 1;
  }

  END_TEST
}
static int g(void)
{
  BEGIN_TEST

#ifdef USE_SSL
  struct peer origin;
#endif
  return 0;
}
