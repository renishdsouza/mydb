const STORAGE_DB = "nitcbase-web";
const STORAGE_KEY = "virtual-disk-v1";

const tabButtons = Array.from(document.querySelectorAll(".tab"));
const tabPanels = Array.from(document.querySelectorAll(".panel"));
const jumpButtons = Array.from(document.querySelectorAll("[data-tab-target]"));

const commandInput = document.getElementById("commandInput");
const runBtn = document.getElementById("runBtn");
const seedBtn = document.getElementById("seedBtn");
const demoBtn = document.getElementById("demoBtn");
const resetBtn = document.getElementById("resetBtn");
const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const consoleOutput = document.getElementById("consoleOutput");
const stateSummary = document.getElementById("stateSummary");
const engineBadge = document.getElementById("engineBadge");

let wasmModule = null;
let wasmReady = false;
let wasmExecute = null;
let wasmInit = null;
let wasmShutdown = null;
let wasmPrintRelation = null;
let previewCounter = 0;

const showcaseCommands = [
  "CLOSE TABLE Combined;",
  "CLOSE TABLE HighCGPA;",
  "CLOSE TABLE Toppers;",
  "CLOSE TABLE NameList;",
  "CLOSE TABLE StudentsCopy;",
  "CLOSE TABLE Marks;",
  "CLOSE TABLE Students;",
  "DROP TABLE Combined;",
  "DROP TABLE HighCGPA;",
  "DROP TABLE Toppers;",
  "DROP TABLE NameList;",
  "DROP TABLE StudentsCopy;",
  "DROP TABLE Marks;",
  "DROP TABLE Students;",
  "CREATE TABLE Students (id NUM, name STR, cgpa NUM);",
  "OPEN TABLE Students;",
  "INSERT INTO Students VALUES (1, Asha, 9.4);",
  "INSERT INTO Students VALUES (2, Ravi, 8.7);",
  "INSERT INTO Students VALUES (3, Nina, 9.1);",
  "CREATE TABLE Marks (id NUM, score NUM);",
  "OPEN TABLE Marks;",
  "INSERT INTO Marks VALUES (1, 95);",
  "INSERT INTO Marks VALUES (2, 84);",
  "INSERT INTO Marks VALUES (3, 90);",
  "SELECT * FROM Students INTO StudentsCopy;",
  "SELECT id, name FROM Students INTO NameList;",
  "SELECT * FROM Students INTO Toppers WHERE cgpa >= 9.0;",
  "SELECT name FROM Students INTO HighCGPA WHERE cgpa > 8.5;",
  "SELECT * FROM Students JOIN Marks INTO Combined WHERE Students.id = Marks.id;",
];

const defaultState = () => ({
  metadata: {
    diskSize: 16 * 1024 * 1024,
    blockSize: 2048,
    totalBlocks: 8192,
    notes: "Browser virtual disk; no host filesystem writes",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  catalogs: {
    RELATIONCAT: [],
    ATTRIBUTECAT: [],
  },
  tables: {},
  logs: [],
});

let state = defaultState();

function setActiveTab(tabId) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
}

function setEngineBadge(mode) {
  if (!engineBadge) return;

  engineBadge.classList.remove("wasm", "fallback");
  if (mode === "wasm") {
    engineBadge.classList.add("wasm");
    engineBadge.textContent = "Engine: WASM native core active";
    return;
  }

  engineBadge.classList.add("fallback");
  engineBadge.textContent = "Engine: JS fallback mode";
}

function print(msg, tone = "info") {
  const line = document.createElement("div");
  line.textContent = msg;
  if (tone === "error") line.style.color = "#ff9d9d";
  if (tone === "success") line.style.color = "#7ff0c6";
  consoleOutput.appendChild(line);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function touchState(note) {
  state.metadata.updatedAt = new Date().toISOString();
  state.logs.push({ at: state.metadata.updatedAt, note });
}

function normalizeValue(raw) {
  const value = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

function normalizeSql(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith(";") ? trimmed.slice(0, -1).trim() : trimmed;
}

function makePreviewRelationName() {
  const suffix = (previewCounter++).toString(36).toUpperCase();
  return `WOUT_${suffix}`.slice(0, 15);
}

function buildDisplaySelectPlan(raw) {
  const sql = normalizeSql(raw);
  if (!/^SELECT\b/i.test(sql)) {
    return null;
  }

  const intoMatch = sql.match(/\bINTO\s+([A-Za-z0-9_-]+)\b/i);
  const hasInto = Boolean(intoMatch);
  if (hasInto && !/^NULL$/i.test(intoMatch[1])) {
    return null;
  }

  const tempRelation = makePreviewRelationName();
  if (hasInto) {
    const rewrittenSql = sql.replace(/\bINTO\s+NULL\b/i, `INTO ${tempRelation}`);
    return { rewrittenSql, tempRelation };
  }

  let m = sql.match(/^SELECT\s+(.+)\s+FROM\s+([A-Za-z0-9_-]+)\s+JOIN\s+([A-Za-z0-9_-]+)\s+WHERE\s+(.+)$/i);
  if (m) {
    return {
      rewrittenSql: `SELECT ${m[1]} FROM ${m[2]} JOIN ${m[3]} INTO ${tempRelation} WHERE ${m[4]}`,
      tempRelation,
    };
  }

  m = sql.match(/^SELECT\s+(.+)\s+FROM\s+([A-Za-z0-9_-]+)\s+WHERE\s+(.+)$/i);
  if (m && !/\bJOIN\b/i.test(sql)) {
    return {
      rewrittenSql: `SELECT ${m[1]} FROM ${m[2]} INTO ${tempRelation} WHERE ${m[3]}`,
      tempRelation,
    };
  }

  m = sql.match(/^SELECT\s+(.+)\s+FROM\s+([A-Za-z0-9_-]+)$/i);
  if (m && !/\bJOIN\b/i.test(sql)) {
    return {
      rewrittenSql: `SELECT ${m[1]} FROM ${m[2]} INTO ${tempRelation}`,
      tempRelation,
    };
  }

  return null;
}

function printRows(columns, rows) {
  print(columns.map((column) => column.name).join(" | "));
  rows.forEach((row) => {
    print(row.map((value) => String(value)).join(" | "));
  });
  print(`(${rows.length} row(s))`, "success");
}

function cleanupPreviewRelationFallback(name) {
  if (state.tables[name]) {
    delete state.tables[name];
    updateCatalogs();
  }
}

function runDisplaySelectFallback(plan) {
  execute(`${plan.rewrittenSql};`);
  const table = ensureTable(plan.tempRelation);
  printRows(table.columns, table.rows);
  cleanupPreviewRelationFallback(plan.tempRelation);
}

function runDisplaySelectWasm(plan) {
  if (!wasmExecute) {
    return -1;
  }

  wasmExecute(`CLOSE TABLE ${plan.tempRelation};`);
  wasmExecute(`DROP TABLE ${plan.tempRelation};`);

  const selectRet = wasmExecute(`${plan.rewrittenSql};`);
  if (selectRet !== 0) {
    return selectRet;
  }

  if (!wasmPrintRelation) {
    print("Error: This WASM build does not support displaying query rows yet", "error");
    return -1;
  }

  const printRet = wasmPrintRelation(plan.tempRelation);

  wasmExecute(`CLOSE TABLE ${plan.tempRelation};`);
  wasmExecute(`DROP TABLE ${plan.tempRelation};`);

  return printRet;
}

function toType(value) {
  return typeof value === "number" ? "NUM" : "STR";
}

function parseColumnSpec(spec) {
  return spec
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = entry.match(/^([#A-Za-z0-9_-]+)\s+(NUM|STR)$/i);
      if (!m) return null;
      return { name: m[1], type: m[2].toUpperCase() };
    });
}

function ensureTable(name) {
  const table = state.tables[name];
  if (!table) {
    throw new Error(`Relation ${name} does not exist`);
  }
  return table;
}

function updateCatalogs() {
  state.catalogs.RELATIONCAT = Object.entries(state.tables).map(([name, table]) => ({
    RelName: name,
    "#Attributes": table.columns.length,
    "#Records": table.rows.length,
  }));

  const attrs = [];
  Object.entries(state.tables).forEach(([name, table]) => {
    table.columns.forEach((column, idx) => {
      attrs.push({
        RelName: name,
        AttributeName: column.name,
        AttributeType: column.type,
        RootBlock: table.indexes[column.name] ? 1 : -1,
        Offset: idx,
      });
    });
  });
  state.catalogs.ATTRIBUTECAT = attrs;
}

function renderState() {
  if (wasmReady) {
    const snapshot = {
      engine: "wasm",
      runtime: "native nitcbase",
      notes: "Commands are executed by compiled C++ core via WebAssembly",
      tip: "Use Reset to reload page and reset runtime image",
    };
    stateSummary.textContent = JSON.stringify(snapshot, null, 2);
    return;
  }

  const snapshot = {
    engine: "js-fallback",
    metadata: state.metadata,
    relations: Object.keys(state.tables).length,
    relationNames: Object.keys(state.tables),
    relationCatalog: state.catalogs.RELATIONCAT,
    attributeCatalogPreview: state.catalogs.ATTRIBUTECAT.slice(0, 12),
    totalLogs: state.logs.length,
  };
  stateSummary.textContent = JSON.stringify(snapshot, null, 2);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

async function tryLoadWasmRuntime() {
  try {
    await loadScript("nitcbase.js");
    if (typeof window.createNitcbaseModule !== "function") {
      throw new Error("createNitcbaseModule not available");
    }

    wasmModule = await window.createNitcbaseModule({
      print: (text) => {
        const msg = String(text || "").trim();
        if (msg) print(msg);
      },
      printErr: (text) => {
        const msg = String(text || "").trim();
        if (msg) print(`stderr: ${msg}`, "error");
      },
    });

    wasmInit = wasmModule.cwrap("nitc_init", "number", []);
    wasmExecute = wasmModule.cwrap("nitc_execute", "number", ["string"]);
    wasmShutdown = wasmModule.cwrap("nitc_shutdown", "number", []);
    wasmPrintRelation = wasmModule.cwrap("nitc_print_relation", "number", ["string"]);

    const ret = wasmInit();
    if (ret !== 0) {
      throw new Error(`nitc_init failed with code ${ret}`);
    }

    wasmReady = true;
    setEngineBadge("wasm");
    renderState();
    print("WASM engine ready: native C++ core is active", "success");
    return true;
  } catch (err) {
    wasmReady = false;
    setEngineBadge("fallback");
    print(`WASM unavailable, using JS fallback: ${err.message}`, "error");
    return false;
  }
}

function runSingleCommand(raw) {
  if (!raw.trim()) return 0;

  const displayPlan = buildDisplaySelectPlan(raw);

  if (wasmReady && wasmExecute) {
    const ret = displayPlan ? runDisplaySelectWasm(displayPlan) : wasmExecute(raw);
    if (ret === 0 || ret === -100) {
      print(`Return code: ${ret}`, "success");
    } else {
      print(`Return code: ${ret}`, "error");
    }
    return ret;
  }

  if (displayPlan) {
    runDisplaySelectFallback(displayPlan);
  } else {
    execute(raw);
  }
  saveState().catch((err) => print(`Persistence warning: ${err.message}`, "error"));
  renderState();
  return 0;
}

async function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveState() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(state, STORAGE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadState() {
  const db = await openDb();
  const loaded = await new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(STORAGE_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  state = loaded || defaultState();
  updateCatalogs();
  renderState();
}

function rowMatchesWhere(table, row, column, op, operand) {
  const idx = table.columns.findIndex((c) => c.name === column);
  if (idx < 0) throw new Error(`Attribute ${column} not found`);

  const left = row[idx];
  const right = normalizeValue(operand);

  switch (op) {
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    default:
      return false;
  }
}

function buildDerivedTable(name, columns, rows) {
  if (state.tables[name]) {
    throw new Error(`Relation ${name} already exists`);
  }
  state.tables[name] = {
    open: false,
    columns: columns.map((c) => ({ ...c })),
    rows: rows.map((r) => [...r]),
    indexes: {},
  };
}

function execute(commandRaw) {
  const command = commandRaw.trim();
  if (!command) return;

  const sql = command.endsWith(";") ? command.slice(0, -1).trim() : command;

  if (/^HELP$/i.test(sql)) {
    print("Supported commands: CREATE, DROP, OPEN, CLOSE, ALTER, INSERT, SELECT, JOIN, INDEX, ECHO");
    return;
  }

  const echoMatch = sql.match(/^ECHO\s+(.+)$/i);
  if (echoMatch) {
    print(echoMatch[1]);
    return;
  }

  if (/^EXIT$/i.test(sql)) {
    print("Session remains in browser storage. You can close this tab safely.", "success");
    return;
  }

  let m = sql.match(/^CREATE\s+TABLE\s+([A-Za-z0-9_-]+)\s*\((.+)\)$/i);
  if (m) {
    const rel = m[1];
    if (state.tables[rel]) throw new Error(`Relation ${rel} already exists`);
    const columns = parseColumnSpec(m[2]);
    if (!columns.length || columns.some((x) => x === null)) {
      throw new Error("Invalid column definition");
    }
    state.tables[rel] = { open: false, columns, rows: [], indexes: {} };
    touchState(`Created relation ${rel}`);
    updateCatalogs();
    print(`Created table ${rel}`, "success");
    return;
  }

  m = sql.match(/^DROP\s+TABLE\s+([A-Za-z0-9_-]+)$/i);
  if (m) {
    const rel = m[1];
    ensureTable(rel);
    delete state.tables[rel];
    touchState(`Dropped relation ${rel}`);
    updateCatalogs();
    print(`Dropped table ${rel}`, "success");
    return;
  }

  m = sql.match(/^OPEN\s+TABLE\s+([A-Za-z0-9_-]+)$/i);
  if (m) {
    const table = ensureTable(m[1]);
    table.open = true;
    touchState(`Opened relation ${m[1]}`);
    print(`Opened table ${m[1]}`, "success");
    return;
  }

  m = sql.match(/^CLOSE\s+TABLE\s+([A-Za-z0-9_-]+)$/i);
  if (m) {
    const table = ensureTable(m[1]);
    table.open = false;
    touchState(`Closed relation ${m[1]}`);
    print(`Closed table ${m[1]}`, "success");
    return;
  }

  m = sql.match(/^ALTER\s+TABLE\s+RENAME\s+([A-Za-z0-9_-]+)\s+TO\s+([A-Za-z0-9_-]+)$/i);
  if (m) {
    const from = m[1];
    const to = m[2];
    ensureTable(from);
    if (state.tables[to]) throw new Error(`Relation ${to} already exists`);
    state.tables[to] = state.tables[from];
    delete state.tables[from];
    touchState(`Renamed relation ${from} to ${to}`);
    updateCatalogs();
    print(`Renamed table ${from} to ${to}`, "success");
    return;
  }

  m = sql.match(/^ALTER\s+TABLE\s+RENAME\s+([A-Za-z0-9_-]+)\s+COLUMN\s+([#A-Za-z0-9_-]+)\s+TO\s+([#A-Za-z0-9_-]+)$/i);
  if (m) {
    const table = ensureTable(m[1]);
    const from = m[2];
    const to = m[3];
    const col = table.columns.find((c) => c.name === from);
    if (!col) throw new Error(`Attribute ${from} not found`);
    col.name = to;
    if (table.indexes[from]) {
      table.indexes[to] = table.indexes[from];
      delete table.indexes[from];
    }
    touchState(`Renamed column ${from} to ${to} in ${m[1]}`);
    updateCatalogs();
    print(`Renamed column ${from} to ${to}`, "success");
    return;
  }

  m = sql.match(/^CREATE\s+INDEX\s+ON\s+([A-Za-z0-9_-]+)\.([#A-Za-z0-9_-]+)$/i);
  if (m) {
    const table = ensureTable(m[1]);
    const attr = m[2];
    const exists = table.columns.some((c) => c.name === attr);
    if (!exists) throw new Error(`Attribute ${attr} not found`);
    table.indexes[attr] = true;
    touchState(`Created index on ${m[1]}.${attr}`);
    updateCatalogs();
    print(`Created index on ${m[1]}.${attr}`, "success");
    return;
  }

  m = sql.match(/^DROP\s+INDEX\s+ON\s+([A-Za-z0-9_-]+)\.([#A-Za-z0-9_-]+)$/i);
  if (m) {
    const table = ensureTable(m[1]);
    delete table.indexes[m[2]];
    touchState(`Dropped index on ${m[1]}.${m[2]}`);
    updateCatalogs();
    print(`Dropped index on ${m[1]}.${m[2]}`, "success");
    return;
  }

  m = sql.match(/^INSERT\s+INTO\s+([A-Za-z0-9_-]+)\s+VALUES\s*\((.+)\)$/i);
  if (m) {
    const rel = m[1];
    const table = ensureTable(rel);
    const values = m[2].split(",").map((v) => normalizeValue(v));
    if (values.length !== table.columns.length) {
      throw new Error("Attribute count mismatch");
    }
    const invalidType = values.some((v, idx) => toType(v) !== table.columns[idx].type);
    if (invalidType) throw new Error("Attribute type mismatch");
    table.rows.push(values);
    touchState(`Inserted row into ${rel}`);
    updateCatalogs();
    print(`Inserted 1 row into ${rel}`, "success");
    return;
  }

  m = sql.match(/^SELECT\s+\*\s+FROM\s+([A-Za-z0-9_-]+)\s+INTO\s+([A-Za-z0-9_-]+)\s+WHERE\s+([#A-Za-z0-9_-]+)\s*(<=|>=|!=|=|<|>)\s*([A-Za-z0-9_.-]+)$/i);
  if (m) {
    const src = ensureTable(m[1]);
    const rows = src.rows.filter((row) => rowMatchesWhere(src, row, m[3], m[4], m[5]));
    buildDerivedTable(m[2], src.columns, rows);
    touchState(`Selected rows from ${m[1]} into ${m[2]}`);
    updateCatalogs();
    print(`Created ${m[2]} with ${rows.length} row(s)`, "success");
    return;
  }

  m = sql.match(/^SELECT\s+\*\s+FROM\s+([A-Za-z0-9_-]+)\s+INTO\s+([A-Za-z0-9_-]+)$/i);
  if (m) {
    const src = ensureTable(m[1]);
    buildDerivedTable(m[2], src.columns, src.rows);
    touchState(`Projected all from ${m[1]} into ${m[2]}`);
    updateCatalogs();
    print(`Created ${m[2]} with ${src.rows.length} row(s)`, "success");
    return;
  }

  m = sql.match(/^SELECT\s+(.+)\s+FROM\s+([A-Za-z0-9_-]+)\s+INTO\s+([A-Za-z0-9_-]+)\s+WHERE\s+([#A-Za-z0-9_-]+)\s*(<=|>=|!=|=|<|>)\s*([A-Za-z0-9_.-]+)$/i);
  if (m && !/\bJOIN\b/i.test(sql)) {
    const attrs = m[1].split(",").map((a) => a.trim());
    const src = ensureTable(m[2]);
    const selectedColumns = attrs.map((name) => {
      const c = src.columns.find((col) => col.name === name);
      if (!c) throw new Error(`Attribute ${name} not found`);
      return c;
    });
    const indexes = attrs.map((name) => src.columns.findIndex((c) => c.name === name));
    const rows = src.rows
      .filter((row) => rowMatchesWhere(src, row, m[4], m[5], m[6]))
      .map((row) => indexes.map((idx) => row[idx]));
    buildDerivedTable(m[3], selectedColumns, rows);
    touchState(`Selected attributes from ${m[2]} into ${m[3]}`);
    updateCatalogs();
    print(`Created ${m[3]} with ${rows.length} row(s)`, "success");
    return;
  }

  m = sql.match(/^SELECT\s+(.+)\s+FROM\s+([A-Za-z0-9_-]+)\s+INTO\s+([A-Za-z0-9_-]+)$/i);
  if (m && !/\bJOIN\b/i.test(sql)) {
    const attrs = m[1].split(",").map((a) => a.trim());
    const src = ensureTable(m[2]);
    const selectedColumns = attrs.map((name) => {
      const c = src.columns.find((col) => col.name === name);
      if (!c) throw new Error(`Attribute ${name} not found`);
      return c;
    });
    const indexes = attrs.map((name) => src.columns.findIndex((c) => c.name === name));
    const rows = src.rows.map((row) => indexes.map((idx) => row[idx]));
    buildDerivedTable(m[3], selectedColumns, rows);
    touchState(`Projected attributes from ${m[2]} into ${m[3]}`);
    updateCatalogs();
    print(`Created ${m[3]} with ${rows.length} row(s)`, "success");
    return;
  }

  m = sql.match(/^SELECT\s+\*\s+FROM\s+([A-Za-z0-9_-]+)\s+JOIN\s+([A-Za-z0-9_-]+)\s+INTO\s+([A-Za-z0-9_-]+)\s+WHERE\s+([A-Za-z0-9_-]+)\.([#A-Za-z0-9_-]+)\s*=\s*([A-Za-z0-9_-]+)\.([#A-Za-z0-9_-]+)$/i);
  if (m) {
    const left = ensureTable(m[1]);
    const right = ensureTable(m[2]);
    const out = m[3];
    const leftAttr = m[5];
    const rightAttr = m[7];

    const leftIdx = left.columns.findIndex((c) => c.name === leftAttr);
    const rightIdx = right.columns.findIndex((c) => c.name === rightAttr);
    if (leftIdx < 0 || rightIdx < 0) throw new Error("Join attribute missing");

    const outColumns = [
      ...left.columns.map((c) => ({ name: `${m[1]}.${c.name}`, type: c.type })),
      ...right.columns.map((c) => ({ name: `${m[2]}.${c.name}`, type: c.type })),
    ];

    const outRows = [];
    left.rows.forEach((lRow) => {
      right.rows.forEach((rRow) => {
        if (lRow[leftIdx] === rRow[rightIdx]) {
          outRows.push([...lRow, ...rRow]);
        }
      });
    });

    buildDerivedTable(out, outColumns, outRows);
    touchState(`Join created relation ${out}`);
    updateCatalogs();
    print(`Created ${out} with ${outRows.length} row(s)`, "success");
    return;
  }

  throw new Error("Unsupported or invalid command");
}

function runCommand() {
  const raw = commandInput.value;
  if (!raw.trim()) return;

  try {
    runSingleCommand(raw);
  } catch (err) {
    print(`Error: ${err.message}`, "error");
  }
}

async function runShowcaseDemo() {
  setActiveTab("playground");
  print("Starting showcase demo sequence", "success");

  for (const cmd of showcaseCommands) {
    commandInput.value = cmd;
    try {
      runSingleCommand(cmd);
    } catch (err) {
      print(`Demo step failed for command: ${cmd}`, "error");
      print(`Reason: ${err.message}`, "error");
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  print("Showcase demo finished", "success");
}

function seedSampleData() {
  if (wasmReady && wasmExecute) {
    const commands = [
      "CREATE TABLE Students (id NUM, name STR, cgpa NUM);",
      "OPEN TABLE Students;",
      "INSERT INTO Students VALUES (1, Asha, 9.4);",
      "INSERT INTO Students VALUES (2, Ravi, 8.7);",
      "INSERT INTO Students VALUES (3, Nina, 9.1);",
      "CREATE TABLE Marks (id NUM, score NUM);",
      "OPEN TABLE Marks;",
      "INSERT INTO Marks VALUES (1, 95);",
      "INSERT INTO Marks VALUES (2, 84);",
      "INSERT INTO Marks VALUES (3, 90);",
    ];
    let failures = 0;
    commands.forEach((cmd) => {
      const ret = wasmExecute(cmd);
      if (ret !== 0) {
        failures += 1;
        print(`Seed command failed (${ret}): ${cmd}`, "error");
      }
    });
    if (failures === 0) {
      print("Sample data loaded in WASM runtime", "success");
    } else {
      print(`Sample data finished with ${failures} failed command(s) in WASM runtime`, "error");
    }
    return;
  }

  state = defaultState();

  state.tables.Students = {
    open: true,
    columns: [
      { name: "id", type: "NUM" },
      { name: "name", type: "STR" },
      { name: "cgpa", type: "NUM" },
    ],
    rows: [
      [1, "Asha", 9.4],
      [2, "Ravi", 8.7],
      [3, "Nina", 9.1],
    ],
    indexes: { id: true },
  };

  state.tables.Marks = {
    open: true,
    columns: [
      { name: "id", type: "NUM" },
      { name: "score", type: "NUM" },
    ],
    rows: [
      [1, 95],
      [2, 84],
      [3, 90],
    ],
    indexes: {},
  };

  touchState("Loaded sample relations");
  updateCatalogs();
  saveState().catch((err) => print(`Persistence warning: ${err.message}`, "error"));
  renderState();
  print("Sample data loaded: Students, Marks", "success");
}

function exportSnapshot() {
  if (wasmReady) {
    print("Snapshot export is only available in JS fallback mode", "error");
    return;
  }

  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "nitcbase-virtual-disk-snapshot.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importSnapshot(file) {
  if (wasmReady) {
    print("Snapshot import is only available in JS fallback mode", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed || typeof parsed !== "object" || !parsed.tables) {
        throw new Error("Invalid snapshot structure");
      }
      state = parsed;
      updateCatalogs();
      saveState().catch((err) => print(`Persistence warning: ${err.message}`, "error"));
      renderState();
      print("Snapshot imported", "success");
    } catch (err) {
      print(`Import failed: ${err.message}`, "error");
    }
  };
  reader.readAsText(file);
}

function resetState() {
  if (wasmReady) {
    if (wasmShutdown) {
      wasmShutdown();
    }
    print("Reloading page to reset WASM runtime image", "success");
    window.location.reload();
    return;
  }

  state = defaultState();
  updateCatalogs();
  saveState().catch((err) => print(`Persistence warning: ${err.message}`, "error"));
  renderState();
  print("Virtual disk reset", "success");
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
});

jumpButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tabTarget));
});

runBtn.addEventListener("click", runCommand);
seedBtn.addEventListener("click", seedSampleData);
demoBtn.addEventListener("click", runShowcaseDemo);
resetBtn.addEventListener("click", resetState);
exportBtn.addEventListener("click", exportSnapshot);

importInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importSnapshot(file);
  importInput.value = "";
});

commandInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "enter") {
    runCommand();
  }
});

(async function init() {
  try {
    setEngineBadge("fallback");
    await loadState();
    print("Virtual disk loaded from IndexedDB", "success");
    await tryLoadWasmRuntime();
    print("Tip: press Ctrl+Enter to execute command");
  } catch (err) {
    state = defaultState();
    updateCatalogs();
    renderState();
    print(`Storage initialization fallback: ${err.message}`, "error");
  }
})();
