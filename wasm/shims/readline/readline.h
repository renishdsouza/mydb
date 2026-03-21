#ifndef WASM_SHIM_READLINE_H
#define WASM_SHIM_READLINE_H

#ifdef __cplusplus
extern "C" {
#endif

int rl_insert(int count, int key);
int rl_bind_key(int key, int (*func)(int, int));
char *readline(const char *prompt);

#ifdef __cplusplus
}
#endif

#endif
