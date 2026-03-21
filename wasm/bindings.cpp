#include <memory>
#include <string>
#include <vector>
#include <iostream>
#include <cstring>

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

void copyRelName(const char *input, char out[ATTR_SIZE]) {
  if (!input) {
    out[0] = '\0';
    return;
  }
  std::strncpy(out, input, ATTR_SIZE - 1);
  out[ATTR_SIZE - 1] = '\0';
}

void printRelationRows(int relId) {
  RelCatEntry relMeta;
  int ret = RelCacheTable::getRelCatEntry(relId, &relMeta);
  if (ret != SUCCESS) {
    std::cout << "Error: Unable to read relation metadata" << std::endl;
    return;
  }

  std::vector<AttrCatEntry> attrs(relMeta.numAttrs);
  for (int i = 0; i < relMeta.numAttrs; i++) {
    ret = AttrCacheTable::getAttrCatEntry(relId, i, &attrs[i]);
    if (ret != SUCCESS) {
      std::cout << "Error: Unable to read attribute metadata" << std::endl;
      return;
    }
  }

  for (int i = 0; i < relMeta.numAttrs; i++) {
    if (i > 0) {
      std::cout << " | ";
    }
    std::cout << attrs[i].attrName;
  }
  std::cout << std::endl;

  RelCacheTable::resetSearchIndex(relId);
  std::vector<Attribute> record(relMeta.numAttrs);
  int rowCount = 0;
  while (BlockAccess::project(relId, record.data()) == SUCCESS) {
    for (int i = 0; i < relMeta.numAttrs; i++) {
      if (i > 0) {
        std::cout << " | ";
      }
      if (attrs[i].attrType == NUMBER) {
        std::cout << record[i].nVal;
      } else {
        std::cout << record[i].sVal;
      }
    }
    std::cout << std::endl;
    rowCount++;
  }

  std::cout << "(" << rowCount << " row(s))" << std::endl;
}
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

int nitc_print_relation(const char *relationName) {
  if (!relationName) {
    return FAILURE;
  }
  if (!g_ready) {
    nitc_init();
  }

  char relName[ATTR_SIZE];
  copyRelName(relationName, relName);

  int relId = OpenRelTable::getRelId(relName);
  bool openedHere = false;
  if (relId == E_RELNOTOPEN) {
    relId = OpenRelTable::openRel(relName);
    if (relId < 0 || relId >= MAX_OPEN) {
      return relId;
    }
    openedHere = true;
  }

  printRelationRows(relId);

  if (openedHere) {
    OpenRelTable::closeRel(relId);
  }

  return SUCCESS;
}

}
