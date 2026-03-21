# NITCbase Web Portal

This folder contains a complete static web portal for documentation and browser execution of NITCbase.

## Why this exists

The native C++ implementation rewrites disk files through `Disk` and `disk_run_copy` paths. Browser deployments on GitHub Pages cannot and should not rewrite host filesystem paths directly.

This portal uses a virtual disk strategy with two engines:

- Primary: WebAssembly build of the real C++ core using Emscripten.
- Fallback: JavaScript runtime when WASM artifacts are not present.
- Browser filesystem is virtualized via Emscripten MEMFS preloaded with `Disk/` and `Files/`.
- Existing native source code remains unchanged.

## Files

- `index.html`: web documentation and interactive console UI.
- `styles.css`: visual theme and responsive layout.
- `app.js`: runtime loader and UI logic (WASM-first, JS fallback).

## Build WASM artifacts

Run from repository root:

```bash
./wasm/build_wasm.sh
```

This generates these files inside `web/`:

- `nitcbase.js`
- `nitcbase.wasm`
- `nitcbase.data`

## Deploy

1. Push repository to GitHub.
2. Go to repository settings.
3. Open Pages.
4. Choose deploy from branch.
5. Select branch `main` and folder `web`.
6. Save and open the generated URL.

## Notes

When WASM artifacts exist, commands are executed by the native C++ parser and engine.
