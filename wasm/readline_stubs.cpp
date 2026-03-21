#include <cstdlib>

extern "C" {

int rl_insert(int, int) {
  return 0;
}

int rl_bind_key(int, int (*)(int, int)) {
  return 0;
}

char *readline(const char *) {
  return nullptr;
}

void add_history(const char *) {
}

}
