#include <memory>
#include <string>

#include "../mynitcbase/Buffer/StaticBuffer.h"
#include "../mynitcbase/Cache/OpenRelTable.h"
#include "../mynitcbase/Disk_Class/Disk.h"
#include "../mynitcbase/FrontendInterface/RegexHandler.h"

namespace {
std::unique_ptr<Disk> g_disk;
std::unique_ptr<StaticBuffer> g_buffer;
std::unique_ptr<OpenRelTable> g_cache;
std::unique_ptr<RegexHandler> g_handler;
bool g_ready = false;
}

extern "C" {

int nitc_init() {
  if (g_ready) {
    return 0;
  }

  g_disk = std::make_unique<Disk>();
  g_buffer = std::make_unique<StaticBuffer>();
  g_cache = std::make_unique<OpenRelTable>();
  g_handler = std::make_unique<RegexHandler>();
  g_ready = true;
  return 0;
}

int nitc_execute(const char *command) {
  if (!command) {
    return -1;
  }
  if (!g_ready) {
    nitc_init();
  }

  return g_handler->handle(std::string(command));
}

int nitc_shutdown() {
  if (!g_ready) {
    return 0;
  }

  g_handler.reset();
  g_cache.reset();
  g_buffer.reset();
  g_disk.reset();
  g_ready = false;
  return 0;
}

}
