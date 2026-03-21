#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/web"
BUILD_DIR="$ROOT_DIR/wasm/build"
mkdir -p "$BUILD_DIR"

COMMON_ARGS=(
  "$ROOT_DIR/mynitcbase/Algebra/Algebra.cpp"
  "$ROOT_DIR/mynitcbase/BlockAccess/BlockAccess.cpp"
  "$ROOT_DIR/mynitcbase/BPlusTree/BPlusTree.cpp"
  "$ROOT_DIR/mynitcbase/Buffer/BlockBuffer.cpp"
  "$ROOT_DIR/mynitcbase/Buffer/StaticBuffer.cpp"
  "$ROOT_DIR/mynitcbase/Cache/AttrCacheTable.cpp"
  "$ROOT_DIR/mynitcbase/Cache/OpenRelTable.cpp"
  "$ROOT_DIR/mynitcbase/Cache/RelCacheTable.cpp"
  "$ROOT_DIR/mynitcbase/Disk_Class/Disk.cpp"
  "$ROOT_DIR/mynitcbase/Frontend/Frontend.cpp"
  "$ROOT_DIR/mynitcbase/FrontendInterface/FrontendInterface.cpp"
  "$ROOT_DIR/mynitcbase/Schema/Schema.cpp"
  "$ROOT_DIR/wasm/bindings.cpp"
  "$ROOT_DIR/wasm/readline_stubs.cpp"
  -I"$ROOT_DIR/wasm/shims"
  -I"$ROOT_DIR/mynitcbase"
  -include sstream
  -std=c++17
  -O2
  -s WASM=1
  -s MODULARIZE=1
  -s EXPORT_NAME=createNitcbaseModule
  -s ENVIRONMENT=web,worker
  -s FORCE_FILESYSTEM=1
  -s EXPORTED_FUNCTIONS=["_nitc_init","_nitc_execute","_nitc_shutdown"]
  -s EXPORTED_RUNTIME_METHODS=["ccall","cwrap"]
  --preload-file "$ROOT_DIR/Disk@/Disk"
  --preload-file "$ROOT_DIR/Files@/Files"
  -o "$OUT_DIR/nitcbase.js"
)

if command -v emcc >/dev/null 2>&1; then
  echo "Using local emcc"
  emcc "${COMMON_ARGS[@]}"
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "Error: emcc not found and docker not available."
    echo "Install Emscripten or Docker, then run this script again."
    exit 1
  fi

  echo "Using docker image emscripten/emsdk"
  docker run --rm -v "$ROOT_DIR:/src" -w /src emscripten/emsdk:3.1.56 \
    emcc \
    /src/mynitcbase/Algebra/Algebra.cpp \
    /src/mynitcbase/BlockAccess/BlockAccess.cpp \
    /src/mynitcbase/BPlusTree/BPlusTree.cpp \
    /src/mynitcbase/Buffer/BlockBuffer.cpp \
    /src/mynitcbase/Buffer/StaticBuffer.cpp \
    /src/mynitcbase/Cache/AttrCacheTable.cpp \
    /src/mynitcbase/Cache/OpenRelTable.cpp \
    /src/mynitcbase/Cache/RelCacheTable.cpp \
    /src/mynitcbase/Disk_Class/Disk.cpp \
    /src/mynitcbase/Frontend/Frontend.cpp \
    /src/mynitcbase/FrontendInterface/FrontendInterface.cpp \
    /src/mynitcbase/Schema/Schema.cpp \
    /src/wasm/bindings.cpp \
    /src/wasm/readline_stubs.cpp \
    -I/src/wasm/shims \
    -I/src/mynitcbase \
    -include sstream \
    -std=c++17 -O2 \
    -s WASM=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME=createNitcbaseModule \
    -s ENVIRONMENT=web,worker \
    -s FORCE_FILESYSTEM=1 \
    -s EXPORTED_FUNCTIONS='["_nitc_init","_nitc_execute","_nitc_shutdown"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
    --preload-file /src/Disk@/Disk \
    --preload-file /src/Files@/Files \
    -o /src/web/nitcbase.js
fi

echo "WASM artifacts generated in web/: nitcbase.js, nitcbase.wasm, nitcbase.data"
