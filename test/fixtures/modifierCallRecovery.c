CURL_EXTERN CURLFORMcode CURL_DEPRECATED(7.56.0, "Use curl_mime_init()")
curl_formadd(struct curl_httppost **httppost,
             struct curl_httppost **last_post,
             ...);
typedef size_t (*curl_formget_callback)(void *arg, const char *buf,
                                        size_t len);
int following(void) { return 0; }
