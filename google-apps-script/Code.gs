/**
 * Control Editorial Sustainability — puente seguro para Google Sheets.
 * @OnlyCurrentDoc
 *
 * Uso:
 * 1. Cree una hoja de cálculo y abra Extensiones > Apps Script.
 * 2. Pegue este archivo completo en Code.gs.
 * 3. En Configuración del proyecto > Propiedades de la secuencia de comandos,
 *    cree SYNC_SECRET con una clave larga y privada.
 * 4. Ejecute configurarHojas una vez y autorice.
 * 5. Implemente como Aplicación web, ejecutar como usted y acceso para cualquiera.
 */

const APP_NAME = "Control Editorial Sustainability";
const SCHEMA_VERSION = 3;
const PROP_SECRET = "SYNC_SECRET";
const PROP_REVISION = "DATA_REVISION";
const PROP_FINGERPRINT = "DATA_FINGERPRINT";

const SHEETS = {
  records: "Procesos",
  payments: "PagosCliente",
  audit: "Historial",
  deleted: "Eliminados",
  config: "Configuracion",
  investigators: "Investigadores",
  clients: "Clientes",
  investigatorHistory: "HistorialInvestigadores",
};

const RECORD_HEADERS = [
  "ID", "Cliente", "Tema", "Producto", "Indexacion", "Estado", "Avance",
  "Usuario", "Contrasena", "Revista", "Link revista", "Link acceso", "Valor APC",
  "Investigador", "Investigador anterior", "Fecha inicio", "Fecha fin", "Fecha aceptacion",
  "Total cliente", "Saldo pendiente", "Proximo pago fecha", "Proximo pago valor",
  "Pago investigador", "Investigador pagado", "Numero contrato", "Orden produccion",
  "Email cliente", "Documento cliente", "Observaciones", "Fuentes JSON", "Creado", "Actualizado",
  "Prioridad operativa", "Fecha inicio contrato", "Fecha fin contrato", "Link contrato",
  "Fecha inicio investigador", "Fecha fin investigador", "Tiene APC", "Telefono cliente",
  "Direccion cliente", "Institucion cliente", "Factura investigador numero",
  "Factura investigador fecha", "Factura investigador valor", "Factura investigador link",
  "Factura investigador estado", "Revistas JSON", "Drive JSON", "Historial investigadores JSON",
];

const PAYMENT_HEADERS = [
  "ID pago", "ID proceso", "Cliente", "Numero contrato", "Concepto",
  "Fecha programada", "Fecha pagada", "Valor", "Estado", "Nota",
];

const AUDIT_HEADERS = ["ID", "Fecha", "Accion", "Detalle"];
const DELETED_HEADERS = ["ID proceso", "Eliminado"];
const CONFIG_HEADERS = ["Clave", "Valor"];
const INVESTIGATOR_HEADERS = [
  "ID", "Nombre", "Documento", "Email", "Telefono", "Especialidad", "Fecha ingreso",
  "Fecha salida", "Carpeta Drive", "Notas", "Activo", "Creado", "Actualizado",
];
const CLIENT_HEADERS = [
  "ID cliente", "Cliente", "Documento", "Email", "Telefono", "Direccion", "Institucion",
  "Numero contratos", "Contratos activos", "Valor total", "Cartera", "Contratos JSON", "Actualizado",
];
const INVESTIGATOR_HISTORY_HEADERS = [
  "ID asignacion", "ID proceso", "Cliente", "Numero contrato", "Investigador", "Responsable actual",
  "Fecha inicio", "Fecha fin", "Honorario", "Abono 1 previsto", "Abono 1 pagado",
  "Abono 1 fecha prevista", "Abono 1 fecha pagada", "Abono 1 estado", "Abono 2 previsto",
  "Abono 2 pagado", "Abono 2 fecha prevista", "Abono 2 fecha pagada", "Abono 2 estado",
  "Total pagado", "Pendiente", "Notas", "Creado", "Actualizado",
];

function doGet() {
  return jsonOutput({
    ok: true,
    service: APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    serverTime: new Date().toISOString(),
  });
}

function doPost(e) {
  try {
    const body = parseBody(e);
    verifyToken(body.token);
    ensureSheets();
    const action = String(body.action || "ping");
    if (action === "ping") return jsonOutput(handlePing());
    if (action === "pull") return jsonOutput(handlePull(Boolean(body.includeCredentials)));
    if (action === "sync") return jsonOutput(handleSync(body));
    return jsonOutput({ ok: false, code: "UNKNOWN_ACTION", message: "Accion no reconocida." });
  } catch (error) {
    return jsonOutput({
      ok: false,
      code: error && error.code ? error.code : "SERVER_ERROR",
      message: error && error.message ? error.message : "Error interno de Apps Script.",
    });
  }
}

function configurarHojas() {
  ensureSheets();
  migrarDatosV3();
  applyDropdownValidations();
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(PROP_REVISION) === null) properties.setProperty(PROP_REVISION, "0");
  writeConfig(getRevision());
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Estructura lista. Configure SYNC_SECRET y publique la aplicacion web.",
    APP_NAME,
    8,
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Control Editorial")
    .addItem("Configurar hojas", "configurarHojas")
    .addItem("Migrar datos a versión 3", "migrarDatosV3")
    .addItem("Ver estado", "mostrarEstado")
    .addToUi();
}

function mostrarEstado() {
  const counts = getCounts();
  SpreadsheetApp.getUi().alert(
    APP_NAME,
    `Revision: ${getRevision()}\nClientes: ${counts.clients}\nProcesos: ${counts.records}\nInvestigadores: ${counts.investigators}\nAsignaciones: ${counts.assignments}\nEsquema: ${SCHEMA_VERSION}`,
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
}

/** Incrementa la revision cuando una persona edita celdas directamente. */
function onEdit(e) {
  if (!e || !e.range || e.range.getRow() < 2) return;
  const name = e.range.getSheet().getName();
  if (![SHEETS.records, SHEETS.payments, SHEETS.deleted, SHEETS.investigators].includes(name)) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    if (name === SHEETS.records) {
      const updatedColumn = RECORD_HEADERS.indexOf("Actualizado") + 1;
      if (e.range.getColumn() !== updatedColumn) {
        e.range.getSheet().getRange(e.range.getRow(), updatedColumn).setValue(new Date().toISOString());
      }
    }
    if (name === SHEETS.payments) touchPaymentRecord(e.range.getSheet(), e.range.getRow());
    if (name === SHEETS.investigators) {
      const updatedColumn = INVESTIGATOR_HEADERS.indexOf("Actualizado") + 1;
      if (e.range.getColumn() !== updatedColumn) e.range.getSheet().getRange(e.range.getRow(), updatedColumn).setValue(new Date().toISOString());
    }
    PropertiesService.getScriptProperties().deleteProperty(PROP_FINGERPRINT);
    setRevision(getRevision() + 1);
  } finally {
    lock.releaseLock();
  }
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) {
    const error = new Error("Solicitud sin contenido.");
    error.code = "EMPTY_REQUEST";
    throw error;
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (reason) {
    const error = new Error("El cuerpo de la solicitud no es JSON valido.");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function verifyToken(supplied) {
  const expected = PropertiesService.getScriptProperties().getProperty(PROP_SECRET);
  if (!expected) {
    const error = new Error("Falta configurar SYNC_SECRET en las propiedades del proyecto.");
    error.code = "SECRET_NOT_CONFIGURED";
    throw error;
  }
  if (!supplied || digest(String(supplied)) !== digest(expected)) {
    const error = new Error("Clave de sincronizacion incorrecta.");
    error.code = "UNAUTHORIZED";
    throw error;
  }
}

function digest(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map((byte) => (`0${(byte + 256).toString(16)}`).slice(-2))
    .join("");
}

function fingerprint(value) {
  return digest(JSON.stringify(value));
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function activeSpreadsheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    const error = new Error("Este script debe estar vinculado a una hoja de calculo.");
    error.code = "NO_SPREADSHEET";
    throw error;
  }
  return spreadsheet;
}

function ensureSheets() {
  const spreadsheet = activeSpreadsheet();
  prepareSheet(spreadsheet, SHEETS.records, RECORD_HEADERS, "#17463f");
  prepareSheet(spreadsheet, SHEETS.payments, PAYMENT_HEADERS, "#2f6f64");
  prepareSheet(spreadsheet, SHEETS.audit, AUDIT_HEADERS, "#536e8a");
  prepareSheet(spreadsheet, SHEETS.deleted, DELETED_HEADERS, "#9a5b52");
  prepareSheet(spreadsheet, SHEETS.config, CONFIG_HEADERS, "#6c766f");
  prepareSheet(spreadsheet, SHEETS.investigators, INVESTIGATOR_HEADERS, "#2f6f64");
  prepareSheet(spreadsheet, SHEETS.clients, CLIENT_HEADERS, "#17463f");
  prepareSheet(spreadsheet, SHEETS.investigatorHistory, INVESTIGATOR_HISTORY_HEADERS, "#536e8a");
}

function applyDropdownValidations() {
  const sheet = activeSpreadsheet().getSheetByName(SHEETS.records);
  if (!sheet || sheet.getMaxRows() < 2) return;
  const rows = sheet.getMaxRows() - 1;
  const lists = {
    Estado: ["Pendiente", "Finalizado", "Elaboración", "Espera del cliente", "Por asignar"],
    Producto: ["Latindex", "Scielo", "Scopus", "WoS"],
    Indexacion: ["Latindex", "Scielo", "Q4", "Q3", "Q2", "Q1"],
    "Prioridad operativa": ["Normal", "Urgente", "Estancado", "Espera del cliente"],
    "Tiene APC": ["Si", "No"],
    "Factura investigador estado": ["Pendiente", "Emitida", "Pagada", "Anulada"],
  };
  Object.keys(lists).forEach((header) => {
    const column = RECORD_HEADERS.indexOf(header) + 1;
    if (column <= 0) return;
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(lists[header], true).setAllowInvalid(header === "Estado").build();
    sheet.getRange(2, column, rows, 1).setDataValidation(rule);
  });
  const investigators = activeSpreadsheet().getSheetByName(SHEETS.investigators);
  if (investigators && investigators.getMaxRows() > 1) {
    const activeColumn = INVESTIGATOR_HEADERS.indexOf("Activo") + 1;
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(["Si", "No"], true).setAllowInvalid(false).build();
    investigators.getRange(2, activeColumn, investigators.getMaxRows() - 1, 1).setDataValidation(rule);
    const names = investigators.getRange(2, INVESTIGATOR_HEADERS.indexOf("Nombre") + 1, Math.max(1, investigators.getMaxRows() - 1), 1);
    const investigatorColumn = RECORD_HEADERS.indexOf("Investigador") + 1;
    const investigatorRule = SpreadsheetApp.newDataValidation().requireValueInRange(names, true).setAllowInvalid(true).build();
    sheet.getRange(2, investigatorColumn, rows, 1).setDataValidation(investigatorRule);
  }
}

function migrarDatosV2() {
  ensureSheets();
  const sheet = activeSpreadsheet().getSheetByName(SHEETS.records);
  if (!sheet || sheet.getLastRow() < 2) return;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, RECORD_HEADERS.length).getValues();
  const col = (name) => RECORD_HEADERS.indexOf(name);
  const catalog = readInvestigators();
  const knownInvestigators = new Set(catalog.map((item) => text(item.name).toUpperCase()));
  rows.forEach((row) => {
    if (!text(row[col("ID")])) return;
    if (!text(row[col("Prioridad operativa")])) row[col("Prioridad operativa")] = "Normal";
    if (!text(row[col("Fecha inicio contrato")])) row[col("Fecha inicio contrato")] = row[col("Fecha inicio")];
    if (!text(row[col("Fecha fin contrato")])) row[col("Fecha fin contrato")] = row[col("Fecha fin")];
    if (!text(row[col("Tiene APC")])) row[col("Tiene APC")] = numberValue(row[col("Valor APC")]) > 0 ? "Si" : "No";
    if (!text(row[col("Factura investigador estado")])) row[col("Factura investigador estado")] = "Pendiente";
    [row[col("Investigador")], row[col("Investigador anterior")]].forEach((rawName) => {
      const name = text(rawName);
      const key = name.toUpperCase();
      if (!name || knownInvestigators.has(key)) return;
      const now = new Date().toISOString();
      catalog.push({
        id: Utilities.getUuid(), name, documentId: "", email: "", phone: "", specialty: "",
        startDate: "", endDate: "", driveFolderUrl: "", notes: "Migrado desde procesos existentes",
        active: true, createdAt: now, updatedAt: now,
      });
      knownInvestigators.add(key);
    });
    if (!text(row[col("Revistas JSON")]) && [row[col("Revista")], row[col("Link revista")], row[col("Link acceso")], row[col("Usuario")], row[col("Contrasena")]].some((value) => text(value))) {
      row[col("Revistas JSON")] = JSON.stringify([{
        id: `${text(row[col("ID")])}-journal-1`,
        journal: text(row[col("Revista")]),
        journalLink: text(row[col("Link revista")]),
        loginLink: text(row[col("Link acceso")]),
        username: text(row[col("Usuario")]),
        password: text(row[col("Contrasena")]),
      }]);
    }
  });
  sheet.getRange(2, 1, rows.length, RECORD_HEADERS.length).setValues(rows);
  writeInvestigators(catalog);
  PropertiesService.getScriptProperties().deleteProperty(PROP_FINGERPRINT);
  setRevision(getRevision() + 1);
  applyDropdownValidations();
}

function migrarDatosV3() {
  migrarDatosV2();
  const records = readRecords();
  records.forEach((record) => {
    if ((!Array.isArray(record.investigatorHistory) || !record.investigatorHistory.length) && (record.investigator || record.previousInvestigator)) {
      record.investigatorHistory = legacyInvestigatorAssignments(record);
    }
  });
  writeRecords(records);
  writeClients(records);
  writeInvestigatorHistory(records);
  PropertiesService.getScriptProperties().deleteProperty(PROP_FINGERPRINT);
  setRevision(getRevision() + 1);
  applyDropdownValidations();
}

function legacyInvestigatorAssignments(record) {
  const currentInvestigator = text(record.investigator);
  const previousInvestigator = text(record.previousInvestigator);
  const fee = Math.max(numberValue(record.investigatorPayment), numberValue(record.investigatorPaid));
  const paid = Math.max(0, numberValue(record.investigatorPaid));
  const firstAmount = Math.round((fee / 2) * 100) / 100;
  const secondAmount = Math.max(0, Math.round((fee - firstAmount) * 100) / 100);
  const firstPaid = Math.min(paid, firstAmount || paid);
  const secondPaid = Math.max(0, Math.min(paid - firstPaid, secondAmount));
  const status = (paidAmount, amount) => amount > 0 && paidAmount >= amount ? "pagado" : paidAmount > 0 ? "parcial" : "pendiente";
  const now = record.updatedAt || new Date().toISOString();
  const history = [];
  if (previousInvestigator && previousInvestigator.toUpperCase() !== currentInvestigator.toUpperCase()) {
    history.push({
      id: `${record.id || Utilities.getUuid()}-assignment-previous`,
      investigator: previousInvestigator,
      startDate: record.contractStartDate || record.startDate || "",
      endDate: record.investigatorStartDate || record.endDate || record.contractEndDate || "",
      agreedPayment: 0,
      installments: [
        { number: 1, amount: 0, paidAmount: 0, scheduledDate: "", paidDate: "", status: "pendiente" },
        { number: 2, amount: 0, paidAmount: 0, scheduledDate: "", paidDate: "", status: "pendiente" },
      ],
      notes: "Migrado como investigador anterior; revise fechas y honorarios",
      isCurrent: false,
      createdAt: record.createdAt || now,
      updatedAt: now,
    });
  }
  if (!currentInvestigator) return history;
  history.push({
    id: `${record.id || Utilities.getUuid()}-assignment-1`,
    investigator: currentInvestigator,
    startDate: record.investigatorStartDate || record.startDate || "",
    endDate: record.investigatorEndDate || record.endDate || "",
    agreedPayment: fee,
    installments: [
      { number: 1, amount: firstAmount, paidAmount: firstPaid, scheduledDate: "", paidDate: "", status: status(firstPaid, firstAmount) },
      { number: 2, amount: secondAmount, paidAmount: secondPaid, scheduledDate: "", paidDate: "", status: status(secondPaid, secondAmount) },
    ],
    notes: "Migrado desde el registro anterior",
    isCurrent: true,
    createdAt: record.createdAt || now,
    updatedAt: now,
  });
  return history;
}

function prepareSheet(spreadsheet, name, headers, color) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (current.join("|") !== headers.join("|")) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground(color)
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setWrap(true);
  const filter = sheet.getFilter();
  if (filter && filter.getRange().getNumColumns() !== headers.length) filter.remove();
  if (!sheet.getFilter() && sheet.getMaxRows() > 1) sheet.getRange(1, 1, Math.max(2, sheet.getLastRow()), headers.length).createFilter();
}

function handlePing() {
  const counts = getCounts();
  return {
    ok: true,
    service: APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    serverTime: new Date().toISOString(),
    revision: getRevision(),
    recordCount: counts.records,
    paymentCount: counts.payments,
    investigatorCount: counts.investigators,
    clientCount: counts.clients,
    assignmentCount: counts.assignments,
  };
}

function handlePull(includeCredentials) {
  const records = readRecords();
  if (!includeCredentials) {
    records.forEach((record) => {
      record.username = "";
      record.password = "";
      record.journalAccesses = (Array.isArray(record.journalAccesses) ? record.journalAccesses : []).map((item) => ({
        ...item,
        username: "",
        password: "",
      }));
    });
  }
  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    revision: getRevision(),
    serverTime: new Date().toISOString(),
    records,
    investigators: readInvestigators(),
    auditLog: readAudit(),
    deletedRecords: readDeleted(),
  };
}

function handleSync(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const currentRevision = getRevision();
    const baseRevision = Number(body.baseRevision || 0);
    if (baseRevision !== currentRevision) {
      const pull = handlePull(Boolean(body.includeCredentials));
      return {
        ok: false,
        code: "REVISION_CONFLICT",
        message: "La hoja cambio durante la sincronizacion. Se requiere conciliar nuevamente.",
        snapshot: {
          revision: pull.revision,
          serverTime: pull.serverTime,
          records: pull.records,
          auditLog: pull.auditLog,
          deletedRecords: pull.deletedRecords,
          investigators: pull.investigators,
          schemaVersion: SCHEMA_VERSION,
        },
      };
    }

    const records = Array.isArray(body.records) ? body.records : [];
    if (records.length > 15000) {
      const error = new Error("La solicitud supera el limite de 15.000 procesos.");
      error.code = "TOO_MANY_RECORDS";
      throw error;
    }

    if (!body.includeCredentials) preserveStoredCredentials(records);
    const investigators = Array.isArray(body.investigators) ? body.investigators : [];
    const audit = Array.isArray(body.auditLog) ? body.auditLog.slice(0, 500) : [];
    const deleted = Array.isArray(body.deletedRecords) ? body.deletedRecords : [];
    const incomingFingerprint = fingerprint({ records, investigators, audit, deleted });
    const properties = PropertiesService.getScriptProperties();
    if (properties.getProperty(PROP_FINGERPRINT) === incomingFingerprint) {
      return {
        ok: true,
        revision: currentRevision,
        serverTime: new Date().toISOString(),
        recordCount: records.length,
        paymentCount: records.reduce((sum, record) => sum + (Array.isArray(record.clientPayments) ? record.clientPayments.length : 0), 0),
        investigatorCount: investigators.length,
        unchanged: true,
      };
    }
    audit.unshift({
      id: `gs-${Utilities.getUuid()}`,
      timestamp: new Date().toISOString(),
      action: "Sincronizacion remota",
      detail: `${records.length} procesos guardados en Google Sheets`,
    });

    writeRecords(records);
    writePayments(records);
    writeInvestigators(investigators);
    writeClients(records);
    writeInvestigatorHistory(records);
    applyDropdownValidations();
    writeAudit(audit.slice(0, 500));
    writeDeleted(deleted);
    const revision = currentRevision + 1;
    setRevision(revision);
    properties.setProperty(PROP_FINGERPRINT, fingerprint({ records, investigators, audit: audit.slice(0, 500), deleted }));
    SpreadsheetApp.flush();
    return {
      ok: true,
      revision,
      serverTime: new Date().toISOString(),
      recordCount: records.length,
      paymentCount: records.reduce((sum, record) => sum + (Array.isArray(record.clientPayments) ? record.clientPayments.length : 0), 0),
      investigatorCount: investigators.length,
    };
  } finally {
    lock.releaseLock();
  }
}

function preserveStoredCredentials(incoming) {
  const existing = new Map(readRecords().map((record) => [String(record.id), record]));
  incoming.forEach((record) => {
    const stored = existing.get(String(record.id));
    if (!stored) return;
    record.username = stored.username || "";
    record.password = stored.password || "";
    const storedAccesses = new Map((Array.isArray(stored.journalAccesses) ? stored.journalAccesses : []).map((item) => [journalAccessKey(item), item]));
    record.journalAccesses = (Array.isArray(record.journalAccesses) ? record.journalAccesses : []).map((item) => {
      const previous = storedAccesses.get(journalAccessKey(item));
      return { ...item, username: previous ? previous.username || "" : "", password: previous ? previous.password || "" : "" };
    });
  });
}

function getCounts() {
  const spreadsheet = activeSpreadsheet();
  return {
    records: Math.max(0, spreadsheet.getSheetByName(SHEETS.records).getLastRow() - 1),
    payments: Math.max(0, spreadsheet.getSheetByName(SHEETS.payments).getLastRow() - 1),
    investigators: Math.max(0, spreadsheet.getSheetByName(SHEETS.investigators).getLastRow() - 1),
    clients: Math.max(0, spreadsheet.getSheetByName(SHEETS.clients).getLastRow() - 1),
    assignments: Math.max(0, spreadsheet.getSheetByName(SHEETS.investigatorHistory).getLastRow() - 1),
  };
}

function getRevision() {
  return Number(PropertiesService.getScriptProperties().getProperty(PROP_REVISION) || 0);
}

function setRevision(value) {
  const revision = Math.max(0, Number(value) || 0);
  PropertiesService.getScriptProperties().setProperty(PROP_REVISION, String(revision));
  writeConfig(revision);
}

function writeConfig(revision) {
  const sheet = activeSpreadsheet().getSheetByName(SHEETS.config);
  if (!sheet) return;
  replaceRows(sheet, CONFIG_HEADERS, [
    ["Aplicacion", APP_NAME],
    ["Version esquema", SCHEMA_VERSION],
    ["Revision datos", revision],
    ["Actualizado", new Date().toISOString()],
  ]);
}

function writeRecords(records) {
  const rows = records.map(recordToRow);
  replaceRows(activeSpreadsheet().getSheetByName(SHEETS.records), RECORD_HEADERS, rows);
}

function recordToRow(record) {
  return [
    cell(record.id), cell(record.client), cell(record.topic), cell(record.product), cell(record.indexation),
    cell(record.status), numberValue(record.progress), cell(record.username), cell(record.password), cell(record.journal),
    cell(record.journalLink), cell(record.loginLink), numberValue(record.apcValue), cell(record.investigator),
    cell(record.previousInvestigator), cell(record.startDate), cell(record.endDate), cell(record.acceptanceDate),
    numberValue(record.clientTotal), numberValue(record.outstandingBalance), cell(record.nextPaymentDate),
    numberValue(record.nextPaymentAmount), numberValue(record.investigatorPayment), numberValue(record.investigatorPaid),
    cell(record.contractNumber), cell(record.productionOrder), cell(record.clientEmail), cell(record.clientId),
    cell(record.observations), cell(JSON.stringify(Array.isArray(record.sources) ? record.sources : [])),
    cell(record.createdAt), cell(record.updatedAt),
    cell(record.operationalStatus || "Normal"), cell(record.contractStartDate), cell(record.contractEndDate), cell(record.contractLink),
    cell(record.investigatorStartDate), cell(record.investigatorEndDate), cell(record.hasApc ? "Si" : "No"),
    cell(record.clientPhone), cell(record.clientAddress), cell(record.clientInstitution), cell(record.investigatorInvoiceNumber),
    cell(record.investigatorInvoiceDate), numberValue(record.investigatorInvoiceValue), cell(record.investigatorInvoiceLink),
    cell(record.investigatorInvoiceStatus || "Pendiente"),
    cell(JSON.stringify(Array.isArray(record.journalAccesses) ? record.journalAccesses : [])),
    cell(JSON.stringify(Array.isArray(record.driveFiles) ? record.driveFiles : [])),
    cell(JSON.stringify(Array.isArray(record.investigatorHistory) ? record.investigatorHistory : [])),
  ];
}

function readRecords() {
  const rows = readObjects(activeSpreadsheet().getSheetByName(SHEETS.records), RECORD_HEADERS);
  const payments = readPayments();
  return rows.filter((row) => text(row.ID)).map((row) => ({
    id: text(row.ID),
    client: text(row.Cliente),
    topic: text(row.Tema),
    product: text(row.Producto),
    indexation: text(row.Indexacion),
    status: text(row.Estado),
    progress: numberValue(row.Avance),
    username: text(row.Usuario),
    password: text(row.Contrasena),
    journal: text(row.Revista),
    journalLink: text(row["Link revista"]),
    loginLink: text(row["Link acceso"]),
    apcValue: numberValue(row["Valor APC"]),
    investigator: text(row.Investigador),
    previousInvestigator: text(row["Investigador anterior"]),
    startDate: dateText(row["Fecha inicio"]),
    endDate: dateText(row["Fecha fin"]),
    acceptanceDate: dateText(row["Fecha aceptacion"]),
    clientTotal: numberValue(row["Total cliente"]),
    outstandingBalance: numberValue(row["Saldo pendiente"]),
    clientPayments: payments.get(text(row.ID)) || [],
    nextPaymentDate: dateText(row["Proximo pago fecha"]),
    nextPaymentAmount: numberValue(row["Proximo pago valor"]),
    investigatorPayment: numberValue(row["Pago investigador"]),
    investigatorPaid: numberValue(row["Investigador pagado"]),
    contractNumber: text(row["Numero contrato"]),
    productionOrder: text(row["Orden produccion"]),
    clientEmail: text(row["Email cliente"]),
    clientId: text(row["Documento cliente"]),
    observations: text(row.Observaciones),
    sources: parseArray(row["Fuentes JSON"]),
    createdAt: timestampText(row.Creado),
    updatedAt: timestampText(row.Actualizado),
    operationalStatus: text(row["Prioridad operativa"]) || "Normal",
    contractStartDate: dateText(row["Fecha inicio contrato"]) || dateText(row["Fecha inicio"]),
    contractEndDate: dateText(row["Fecha fin contrato"]) || dateText(row["Fecha fin"]),
    contractLink: text(row["Link contrato"]),
    investigatorStartDate: dateText(row["Fecha inicio investigador"]),
    investigatorEndDate: dateText(row["Fecha fin investigador"]),
    hasApc: booleanValue(row["Tiene APC"]) || numberValue(row["Valor APC"]) > 0,
    clientPhone: text(row["Telefono cliente"]),
    clientAddress: text(row["Direccion cliente"]),
    clientInstitution: text(row["Institucion cliente"]),
    investigatorInvoiceNumber: text(row["Factura investigador numero"]),
    investigatorInvoiceDate: dateText(row["Factura investigador fecha"]),
    investigatorInvoiceValue: numberValue(row["Factura investigador valor"]),
    investigatorInvoiceLink: text(row["Factura investigador link"]),
    investigatorInvoiceStatus: text(row["Factura investigador estado"]) || "Pendiente",
    journalAccesses: parseArray(row["Revistas JSON"]),
    driveFiles: parseArray(row["Drive JSON"]),
    investigatorHistory: parseArray(row["Historial investigadores JSON"]),
  }));
}

function writePayments(records) {
  const rows = [];
  records.forEach((record) => {
    (Array.isArray(record.clientPayments) ? record.clientPayments : []).forEach((payment) => {
      rows.push([
        cell(payment.id), cell(record.id), cell(record.client), cell(record.contractNumber), cell(payment.concept),
        cell(payment.scheduledDate), cell(payment.paidDate), numberValue(payment.amount), cell(payment.status), cell(payment.note),
      ]);
    });
  });
  replaceRows(activeSpreadsheet().getSheetByName(SHEETS.payments), PAYMENT_HEADERS, rows);
}

function readPayments() {
  const grouped = new Map();
  readObjects(activeSpreadsheet().getSheetByName(SHEETS.payments), PAYMENT_HEADERS).forEach((row) => {
    const recordId = text(row["ID proceso"]);
    if (!recordId || !text(row["ID pago"])) return;
    const list = grouped.get(recordId) || [];
    list.push({
      id: text(row["ID pago"]),
      concept: text(row.Concepto),
      scheduledDate: dateText(row["Fecha programada"]),
      paidDate: dateText(row["Fecha pagada"]),
      amount: numberValue(row.Valor),
      status: text(row.Estado) || "pendiente",
      note: text(row.Nota),
    });
    grouped.set(recordId, list);
  });
  return grouped;
}

function writeInvestigators(items) {
  const rows = (Array.isArray(items) ? items : []).filter((item) => item && item.id && item.name).map((item) => [
    cell(item.id), cell(item.name), cell(item.documentId), cell(item.email), cell(item.phone), cell(item.specialty),
    cell(item.startDate), cell(item.endDate), cell(item.driveFolderUrl), cell(item.notes), cell(item.active === false ? "No" : "Si"),
    cell(item.createdAt), cell(item.updatedAt),
  ]);
  replaceRows(activeSpreadsheet().getSheetByName(SHEETS.investigators), INVESTIGATOR_HEADERS, rows);
}

function readInvestigators() {
  return readObjects(activeSpreadsheet().getSheetByName(SHEETS.investigators), INVESTIGATOR_HEADERS)
    .filter((row) => text(row.ID) && text(row.Nombre))
    .map((row) => ({
      id: text(row.ID),
      name: text(row.Nombre),
      documentId: text(row.Documento),
      email: text(row.Email),
      phone: text(row.Telefono),
      specialty: text(row.Especialidad),
      startDate: dateText(row["Fecha ingreso"]),
      endDate: dateText(row["Fecha salida"]),
      driveFolderUrl: text(row["Carpeta Drive"]),
      notes: text(row.Notas),
      active: booleanValue(row.Activo),
      createdAt: timestampText(row.Creado),
      updatedAt: timestampText(row.Actualizado),
    }));
}

function writeClients(records) {
  const grouped = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    if (!text(record.client)) return;
    const key = text(record.client).toUpperCase();
    grouped.set(key, [...(grouped.get(key) || []), record]);
  });
  const rows = [...grouped.values()].sort((a, b) => text(a[0].client).localeCompare(text(b[0].client))).map((items) => {
    const profile = items.find((item) => item.clientEmail || item.clientPhone || item.clientId || item.clientInstitution) || items[0];
    const contracts = items.map((item) => ({
      id: item.id || "",
      contractNumber: item.contractNumber || "",
      topic: item.topic || "",
      status: item.status || "",
      startDate: item.contractStartDate || "",
      endDate: item.contractEndDate || "",
    }));
    return [
      cell(profile.clientId || text(profile.client).toUpperCase()), cell(profile.client), cell(profile.clientId),
      cell(profile.clientEmail), cell(profile.clientPhone), cell(profile.clientAddress), cell(profile.clientInstitution),
      items.length, items.filter((item) => !/FINALIZAD|PUBLICAD|CERRAD/i.test(text(item.status))).length,
      items.reduce((sum, item) => sum + numberValue(item.clientTotal), 0),
      items.reduce((sum, item) => sum + clientRecordBalance(item), 0),
      cell(JSON.stringify(contracts)), cell(items.map((item) => item.updatedAt).sort().pop() || new Date().toISOString()),
    ];
  });
  replaceRows(activeSpreadsheet().getSheetByName(SHEETS.clients), CLIENT_HEADERS, rows);
}

function clientRecordBalance(record) {
  const payments = Array.isArray(record.clientPayments) ? record.clientPayments : [];
  const paid = payments.filter((payment) => text(payment.status).toLowerCase() === "pagado")
    .reduce((sum, payment) => sum + numberValue(payment.amount), 0);
  if (paid > 0 && numberValue(record.clientTotal) > 0) return Math.max(0, numberValue(record.clientTotal) - paid);
  if (numberValue(record.outstandingBalance) > 0) return numberValue(record.outstandingBalance);
  return Math.max(0, numberValue(record.clientTotal) - paid);
}

function writeInvestigatorHistory(records) {
  const rows = [];
  (Array.isArray(records) ? records : []).forEach((record) => {
    (Array.isArray(record.investigatorHistory) ? record.investigatorHistory : []).forEach((assignment) => {
      const installments = Array.isArray(assignment.installments) ? assignment.installments : [];
      const first = installments[0] || {};
      const second = installments[1] || {};
      const paid = numberValue(first.paidAmount) + numberValue(second.paidAmount);
      rows.push([
        cell(assignment.id), cell(record.id), cell(record.client), cell(record.contractNumber), cell(assignment.investigator),
        cell(assignment.isCurrent ? "Si" : "No"), cell(assignment.startDate), cell(assignment.endDate),
        numberValue(assignment.agreedPayment), numberValue(first.amount), numberValue(first.paidAmount),
        cell(first.scheduledDate), cell(first.paidDate), cell(first.status || "pendiente"),
        numberValue(second.amount), numberValue(second.paidAmount), cell(second.scheduledDate), cell(second.paidDate),
        cell(second.status || "pendiente"), paid, Math.max(0, numberValue(assignment.agreedPayment) - paid),
        cell(assignment.notes), cell(assignment.createdAt), cell(assignment.updatedAt),
      ]);
    });
  });
  replaceRows(activeSpreadsheet().getSheetByName(SHEETS.investigatorHistory), INVESTIGATOR_HISTORY_HEADERS, rows);
}

function writeAudit(entries) {
  const rows = entries.map((entry) => [cell(entry.id), cell(entry.timestamp), cell(entry.action), cell(entry.detail)]);
  replaceRows(activeSpreadsheet().getSheetByName(SHEETS.audit), AUDIT_HEADERS, rows);
}

function readAudit() {
  return readObjects(activeSpreadsheet().getSheetByName(SHEETS.audit), AUDIT_HEADERS)
    .filter((row) => text(row.ID))
    .map((row) => ({ id: text(row.ID), timestamp: timestampText(row.Fecha), action: text(row.Accion), detail: text(row.Detalle) }))
    .slice(0, 500);
}

function writeDeleted(entries) {
  const rows = entries.filter((entry) => entry && entry.id).map((entry) => [cell(entry.id), cell(entry.deletedAt)]);
  replaceRows(activeSpreadsheet().getSheetByName(SHEETS.deleted), DELETED_HEADERS, rows);
}

function readDeleted() {
  return readObjects(activeSpreadsheet().getSheetByName(SHEETS.deleted), DELETED_HEADERS)
    .filter((row) => text(row["ID proceso"]))
    .map((row) => ({ id: text(row["ID proceso"]), deletedAt: timestampText(row.Eliminado) }));
}

function replaceRows(sheet, headers, rows) {
  if (!sheet) return;
  if (sheet.getFilter()) sheet.getFilter().remove();
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  if (sheet.getMaxRows() < rows.length + 1) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
  }
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setBackground("#17463f").setFontColor("#ffffff").setFontWeight("bold");
  if (rows.length) sheet.getRange(1, 1, rows.length + 1, headers.length).createFilter();
}

function readObjects(sheet, headers) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.map((row) => {
    const object = {};
    headers.forEach((header, index) => { object[header] = row[index]; });
    return object;
  });
}

function touchPaymentRecord(paymentSheet, row) {
  const recordId = text(paymentSheet.getRange(row, PAYMENT_HEADERS.indexOf("ID proceso") + 1).getValue());
  if (!recordId) return;
  const recordsSheet = activeSpreadsheet().getSheetByName(SHEETS.records);
  if (recordsSheet.getLastRow() < 2) return;
  const ids = recordsSheet.getRange(2, 1, recordsSheet.getLastRow() - 1, 1).getValues();
  const index = ids.findIndex((value) => text(value[0]) === recordId);
  if (index >= 0) recordsSheet.getRange(index + 2, RECORD_HEADERS.indexOf("Actualizado") + 1).setValue(new Date().toISOString());
}

function cell(value) {
  if (value === null || value === undefined) return "";
  const result = String(value);
  return /^[=+\-@]/.test(result) ? `'${result}` : result;
}

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value === null || value === undefined ? "" : value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanValue(value) {
  return /^(SI|SÍ|TRUE|1|YES|ACTIVO)$/i.test(text(value));
}

function journalAccessKey(item) {
  if (!item) return "";
  return text(item.id) || `${text(item.journal)}|${text(item.journalLink)}|${text(item.loginLink)}`;
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(text(value) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (reason) {
    return text(value) ? [text(value)] : [];
  }
}

function dateText(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const result = text(value);
  return result.length >= 10 ? result.slice(0, 10) : result;
}

function timestampText(value) {
  if (value instanceof Date) return value.toISOString();
  return text(value) || new Date().toISOString();
}
