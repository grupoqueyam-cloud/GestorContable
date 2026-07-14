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
const SCHEMA_VERSION = 1;
const PROP_SECRET = "SYNC_SECRET";
const PROP_REVISION = "DATA_REVISION";
const PROP_FINGERPRINT = "DATA_FINGERPRINT";

const SHEETS = {
  records: "Procesos",
  payments: "PagosCliente",
  audit: "Historial",
  deleted: "Eliminados",
  config: "Configuracion",
};

const RECORD_HEADERS = [
  "ID", "Cliente", "Tema", "Producto", "Indexacion", "Estado", "Avance",
  "Usuario", "Contrasena", "Revista", "Link revista", "Link acceso", "Valor APC",
  "Investigador", "Investigador anterior", "Fecha inicio", "Fecha fin", "Fecha aceptacion",
  "Total cliente", "Saldo pendiente", "Proximo pago fecha", "Proximo pago valor",
  "Pago investigador", "Investigador pagado", "Numero contrato", "Orden produccion",
  "Email cliente", "Documento cliente", "Observaciones", "Fuentes JSON", "Creado", "Actualizado",
];

const PAYMENT_HEADERS = [
  "ID pago", "ID proceso", "Cliente", "Numero contrato", "Concepto",
  "Fecha programada", "Fecha pagada", "Valor", "Estado", "Nota",
];

const AUDIT_HEADERS = ["ID", "Fecha", "Accion", "Detalle"];
const DELETED_HEADERS = ["ID proceso", "Eliminado"];
const CONFIG_HEADERS = ["Clave", "Valor"];

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
    .addItem("Ver estado", "mostrarEstado")
    .addToUi();
}

function mostrarEstado() {
  const counts = getCounts();
  SpreadsheetApp.getUi().alert(
    APP_NAME,
    `Revision: ${getRevision()}\nProcesos: ${counts.records}\nPagos: ${counts.payments}\nEsquema: ${SCHEMA_VERSION}`,
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
}

/** Incrementa la revision cuando una persona edita celdas directamente. */
function onEdit(e) {
  if (!e || !e.range || e.range.getRow() < 2) return;
  const name = e.range.getSheet().getName();
  if (![SHEETS.records, SHEETS.payments, SHEETS.deleted].includes(name)) return;
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
}

function prepareSheet(spreadsheet, name, headers, color) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (current.join("|") !== headers.join("|")) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground(color)
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setWrap(true);
  if (!sheet.getFilter() && sheet.getMaxRows() > 1) {
    sheet.getRange(1, 1, Math.max(2, sheet.getLastRow()), headers.length).createFilter();
  }
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
  };
}

function handlePull(includeCredentials) {
  const records = readRecords();
  if (!includeCredentials) {
    records.forEach((record) => {
      record.username = "";
      record.password = "";
    });
  }
  return {
    ok: true,
    revision: getRevision(),
    serverTime: new Date().toISOString(),
    records,
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
    const audit = Array.isArray(body.auditLog) ? body.auditLog.slice(0, 500) : [];
    const deleted = Array.isArray(body.deletedRecords) ? body.deletedRecords : [];
    const incomingFingerprint = fingerprint({ records, audit, deleted });
    const properties = PropertiesService.getScriptProperties();
    if (properties.getProperty(PROP_FINGERPRINT) === incomingFingerprint) {
      return {
        ok: true,
        revision: currentRevision,
        serverTime: new Date().toISOString(),
        recordCount: records.length,
        paymentCount: records.reduce((sum, record) => sum + (Array.isArray(record.clientPayments) ? record.clientPayments.length : 0), 0),
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
    writeAudit(audit.slice(0, 500));
    writeDeleted(deleted);
    const revision = currentRevision + 1;
    setRevision(revision);
    properties.setProperty(PROP_FINGERPRINT, fingerprint({ records, audit: audit.slice(0, 500), deleted }));
    SpreadsheetApp.flush();
    return {
      ok: true,
      revision,
      serverTime: new Date().toISOString(),
      recordCount: records.length,
      paymentCount: records.reduce((sum, record) => sum + (Array.isArray(record.clientPayments) ? record.clientPayments.length : 0), 0),
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
  });
}

function getCounts() {
  const spreadsheet = activeSpreadsheet();
  return {
    records: Math.max(0, spreadsheet.getSheetByName(SHEETS.records).getLastRow() - 1),
    payments: Math.max(0, spreadsheet.getSheetByName(SHEETS.payments).getLastRow() - 1),
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
