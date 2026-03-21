# NITCbase WASM Build

This directory compiles the real NITCbase C++ engine into WebAssembly for browser use.

## What gets compiled

- Core modules from `mynitcbase` (Schema, Algebra, Buffer, Disk, B+Tree, Cache)
- Frontend regex command parser (`FrontendInterface.cpp`)
- WASM C bindings in `wasm/bindings.cpp`
- Readline shims/stubs for browser compatibility

## Build command

```bash
./wasm/build_wasm.sh
```

The script tries:

1. Local `emcc` if installed.
2. Docker image `emscripten/emsdk:3.1.56` if `emcc` is not installed.

## Output

Artifacts are written to `web/`:

- `nitcbase.js`
- `nitcbase.wasm`
- `nitcbase.data`

Your site auto-detects these files and switches to WASM engine mode.
