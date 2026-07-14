import type { AppData, ClientPayment, EditorialRecord } from "./types";
import {
  blankRecord,
  canonicalKey,
  normalizeText,
  statusProgress,
  toDate,
  toNumber,
  uid,
} from "./format";

type CellValue = unknown;
type Matrix = CellValue[][];

const cellValue = (value: CellValue): CellValue => {
  if (value && typeof value === "object") {
    const candidate = value as { result?: unknown; text?: string; richText?: { text: string }[] };
    if (candidate.result !== undefined) return candidate.result;
    if (candidate.text !== undefined) return candidate.text;
    if (Array.isArray(candidate.richText)) return candidate.richText.map((part) => part.text).join("");
  }
  return value;
};

const text = (value: CellValue) => String(cellValue(value) ?? "").trim();
const header = (value: CellValue) => normalizeText(text(value)).toUpperCase();

const rowHasData = (row: CellValue[]) => row.some((value) => text(value) !== "");

const paymentFromCell = (value: CellValue, concept: string): ClientPayment | null => {
  const raw = text(value);
  if (!raw) return null;
  const normalized = normalizeText(raw).toUpperCase();
  const amount = toNumber(cellValue(value));
  const paid = amount > 0 || /PAGAD|CANCELAD|REALIZAD|SI|OK/.test(normalized);
  return {
    id: uid(),
    concept,
    scheduledDate: "",
    paidDate: "",
    amount,
    status: paid ? "pagado" : "pendiente",
    note: amount > 0 ? "Importado desde Excel" : raw,
  };
};

const uniquePayments = (payments: ClientPayment[]) => {
  const found = new Set<string>();
  return payments.filter((payment) => {
    const key = `${normalizeText(payment.concept)}|${payment.amount}|${payment.scheduledDate}|${payment.paidDate}`;
    if (found.has(key)) return false;
    found.add(key);
    return true;
  });
};

export const mergeRecordSets = (
  current: EditorialRecord[],
  incoming: EditorialRecord[],
): EditorialRecord[] => {
  const byKey = new Map<string, EditorialRecord>();
  current.forEach((record) => byKey.set(canonicalKey(record), record));

  incoming.forEach((record) => {
    const key = canonicalKey(record);
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, record);
      return;
    }
    const merged = { ...previous } as EditorialRecord;
    const textFields: (keyof EditorialRecord)[] = [
      "client",
      "topic",
      "product",
      "indexation",
      "status",
      "username",
      "password",
      "journal",
      "journalLink",
      "loginLink",
      "investigator",
      "previousInvestigator",
      "startDate",
      "endDate",
      "acceptanceDate",
      "nextPaymentDate",
      "contractNumber",
      "productionOrder",
      "clientEmail",
      "clientId",
    ];
    textFields.forEach((field) => {
      if (String(record[field] ?? "").trim()) {
        (merged[field] as string) = String(record[field]);
      }
    });
    merged.progress = Math.max(previous.progress, record.progress);
    merged.apcValue = Math.max(previous.apcValue, record.apcValue);
    merged.clientTotal = Math.max(previous.clientTotal, record.clientTotal);
    merged.outstandingBalance = Math.max(
      Number(previous.outstandingBalance) || 0,
      Number(record.outstandingBalance) || 0,
    );
    merged.nextPaymentAmount = Math.max(previous.nextPaymentAmount, record.nextPaymentAmount);
    merged.investigatorPayment = Math.max(
      previous.investigatorPayment,
      record.investigatorPayment,
    );
    merged.investigatorPaid = Math.max(previous.investigatorPaid, record.investigatorPaid);
    merged.clientPayments = uniquePayments([
      ...previous.clientPayments,
      ...record.clientPayments,
    ]);
    merged.observations = [previous.observations, record.observations]
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .join(" · ");
    merged.sources = Array.from(new Set([...previous.sources, ...record.sources]));
    merged.updatedAt = new Date().toISOString();
    byKey.set(key, merged);
  });

  return Array.from(byKey.values()).sort((a, b) => a.client.localeCompare(b.client, "es"));
};

const rowMap = (matrix: Matrix, start: number, end: number) => {
  const map = new Map<string, CellValue[]>();
  for (let index = start; index <= end && index < matrix.length; index += 1) {
    const label = header(matrix[index]?.[0]);
    if (label) map.set(label, matrix[index]);
  }
  return map;
};

const findRow = (map: Map<string, CellValue[]>, patterns: RegExp[]) => {
  for (const [label, row] of map.entries()) {
    if (patterns.some((pattern) => pattern.test(label))) return row;
  }
  return [] as CellValue[];
};

const parseProductionSheet = (
  matrix: Matrix,
  sheetName: string,
  fileName: string,
): EditorialRecord[] => {
  const records: EditorialRecord[] = [];
  const clientRows = matrix
    .map((row, index) => ({ index, label: header(row?.[0]) }))
    .filter(({ label }) => label === "CLIENTE");

  clientRows.forEach(({ index: clientIndex }, blockPosition) => {
    const previousClient = blockPosition > 0 ? clientRows[blockPosition - 1].index : -1;
    let start = clientIndex;
    for (let i = clientIndex; i > Math.max(previousClient, clientIndex - 8); i -= 1) {
      if (/^CONTRATO$/.test(header(matrix[i]?.[0]))) {
        start = i;
        break;
      }
    }
    const nextClient = clientRows[blockPosition + 1]?.index ?? matrix.length;
    const end = Math.min(nextClient - 1, clientIndex + 18);
    const labels = rowMap(matrix, start, end);
    const clientRow = matrix[clientIndex] || [];
    const contractRow = findRow(labels, [/^CONTRATO$/]);
    const orderRow = findRow(labels, [/ORDEN DE PRODUCCION/]);
    const productRow = findRow(labels, [/^PRODUCTO$/]);
    const startRow = findRow(labels, [/^INICIO/, /FECHA CONTRATO CLIENTE/]);
    const endRow = findRow(labels, [/^FIN/, /FECH FINAL/]);
    const totalRow = findRow(labels, [/FACTURA TOTAL.*CLIENTE/]);
    const balanceRow = findRow(labels, [/SALDO CLIENTE/]);
    const statusRow = findRow(labels, [
      /ESTADO DE PRODUCTO/,
      /PROCESO DE SERVICIO/,
      /PROCESO DE PRODUCTO/,
      /^PUBLICADO$/,
      /^TERMINADO$/,
    ]);
    const payment1 = findRow(labels, [/^1\s*(RE|ER)?\s*PAGO$/]);
    const payment2 = findRow(labels, [/^2\s*(DO)?\s*PAGO$/]);
    const payment3 = findRow(labels, [/^3\s*(ER)?\s*PAGO$/]);
    const investigatorInvoice = findRow(labels, [/FACTURA.*INVESTIGADOR/, /^FACTURA$/]);

    for (let column = 1; column < clientRow.length; column += 1) {
      const client = text(clientRow[column]);
      if (!client || /^(CLIENTE|TOTAL|DATOS)$/i.test(client)) continue;
      const record = blankRecord();
      record.client = client;
      record.contractNumber = text(contractRow[column]);
      record.productionOrder = text(orderRow[column]);
      record.product = text(productRow[column]);
      record.topic = record.product;
      record.startDate = toDate(cellValue(startRow[column]));
      record.endDate = toDate(cellValue(endRow[column]));
      record.clientTotal = toNumber(cellValue(totalRow[column]));
      const sourceBalance = toNumber(cellValue(balanceRow[column]));
      record.status = text(statusRow[column]) || "Pendiente";
      record.progress = statusProgress(record.status);
      record.investigator = sheetName.trim();
      record.investigatorPayment = [payment1, payment2, payment3]
        .reduce((sum, row) => sum + toNumber(cellValue(row[column])), 0);
      record.investigatorPaid = toNumber(cellValue(investigatorInvoice[column]));
      if (sourceBalance > 0) record.nextPaymentAmount = sourceBalance;
      if (sourceBalance > 0) record.outstandingBalance = sourceBalance;
      if (sourceBalance > 0 && record.endDate) record.nextPaymentDate = record.endDate;
      record.observations = sourceBalance > 0
        ? `Saldo registrado en matriz de producción: ${sourceBalance}`
        : "";
      record.sources = [`${fileName} · ${sheetName}`];
      records.push(record);
    }
  });

  return records;
};

const aliases = {
  client: [/^CLIENTE$/, /^NOMBRE CLIENTE$/],
  topic: [/^TEMA$/, /NOMBRE ARTICULO/],
  product: [/^PRODUCTO$/],
  journal: [/^REVISTAS?$/],
  username: [/^USUARIO$/, /^USUARO$/, /^USUARIO 2$/],
  password: [/CONTRASENA/],
  indexation: [/INDEXACION/],
  status: [/^ESTADO$/, /ESTADO DE ENVIO/],
  startDate: [/FECHA DE INICIO/],
  endDate: [/FECHA DE FIN/],
  acceptanceDate: [/FECHA ACEPTACION/],
  journalLink: [/^LINK REVISTA$/, /^LINK$/],
  loginLink: [/LINK LOGGIN/, /LINK LOGIN/],
  contractNumber: [/CONTRATO/],
  productionOrder: [/ORDEN DE PRODUCCION/],
  observations: [/OBSERVACION/],
  email: [/^CORREO$/],
  clientId: [/^C\.C$/, /^CEDULA$/],
  previousInvestigator: [/INVESTIGADOR ANTERIOR/, /PROCESO ANTERIOR DE/],
  investigator: [/INVESTIGADOR A CARGO/, /NUEVO INVESTIGADOR/],
  payment1: [/^1(RE|ER|RO)?\s*PAGO$/],
  payment2: [/^2(DO)?\s*PAGO$/],
};

const findColumn = (headers: string[], patterns: RegExp[]) =>
  headers.findIndex((value) => patterns.some((pattern) => pattern.test(value)));

const parseControlSheet = (
  matrix: Matrix,
  sheetName: string,
  fileName: string,
): EditorialRecord[] => {
  let headerIndex = -1;
  let headers: string[] = [];
  for (let row = 0; row < Math.min(matrix.length, 15); row += 1) {
    const candidate = (matrix[row] || []).map(header);
    const score = Object.values(aliases).filter((patterns) => findColumn(candidate, patterns) >= 0).length;
    if (score >= 3 && findColumn(candidate, aliases.client) >= 0) {
      headerIndex = row;
      headers = candidate;
      break;
    }
  }
  if (headerIndex < 0) return [];

  const columns = Object.fromEntries(
    Object.entries(aliases).map(([key, patterns]) => [key, findColumn(headers, patterns)]),
  ) as Record<keyof typeof aliases, number>;
  const get = (row: CellValue[], key: keyof typeof aliases) =>
    columns[key] >= 0 ? cellValue(row[columns[key]]) : "";

  const records: EditorialRecord[] = [];
  let emptyRows = 0;
  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    if (!rowHasData(row)) {
      emptyRows += 1;
      if (emptyRows >= 5) break;
      continue;
    }
    emptyRows = 0;
    const client = text(get(row, "client"));
    if (!client || /^(CLIENTE|TOTAL)$/i.test(client)) continue;
    const record = blankRecord();
    record.client = client;
    record.topic = text(get(row, "topic"));
    record.product = text(get(row, "product"));
    record.journal = text(get(row, "journal"));
    record.username = text(get(row, "username"));
    record.password = text(get(row, "password"));
    record.indexation = text(get(row, "indexation"));
    record.status = text(get(row, "status")) || "Pendiente";
    record.progress = statusProgress(record.status);
    record.startDate = toDate(get(row, "startDate"));
    record.endDate = toDate(get(row, "endDate"));
    record.acceptanceDate = toDate(get(row, "acceptanceDate"));
    record.journalLink = text(get(row, "journalLink"));
    record.loginLink = text(get(row, "loginLink"));
    record.contractNumber = text(get(row, "contractNumber"));
    record.productionOrder = text(get(row, "productionOrder"));
    record.observations = text(get(row, "observations"));
    record.clientEmail = text(get(row, "email"));
    record.clientId = text(get(row, "clientId"));
    record.previousInvestigator = text(get(row, "previousInvestigator"));
    record.investigator = text(get(row, "investigator")) || sheetName.trim();
    const payments = [
      paymentFromCell(get(row, "payment1"), "Primer pago"),
      paymentFromCell(get(row, "payment2"), "Segundo pago"),
    ].filter(Boolean) as ClientPayment[];
    record.clientPayments = payments;
    record.sources = [`${fileName} · ${sheetName}`];
    records.push(record);
  }
  return records;
};

const worksheetToMatrix = (worksheet: {
  rowCount: number;
  columnCount: number;
  getRow: (index: number) => { getCell: (column: number) => { value: unknown } };
}) => {
  const matrix: Matrix = [];
  for (let row = 1; row <= worksheet.rowCount; row += 1) {
    const values: CellValue[] = [];
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      values.push(worksheet.getRow(row).getCell(column).value);
    }
    matrix.push(values);
  }
  return matrix;
};

export const parseExcelFile = async (file: File): Promise<EditorialRecord[]> => {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  let records: EditorialRecord[] = [];
  workbook.worksheets.forEach((worksheet) => {
    const matrix = worksheetToMatrix(worksheet);
    const looksTransposed = matrix.some(
      (row) => header(row?.[0]) === "CONTRATO" && row.slice(1).filter((value) => text(value)).length > 1,
    );
    const parsed = looksTransposed
      ? parseProductionSheet(matrix, worksheet.name, file.name)
      : parseControlSheet(matrix, worksheet.name, file.name);
    records = mergeRecordSets(records, parsed);
  });
  return records;
};

export const importExcelFiles = async (
  files: File[],
  existing: EditorialRecord[] = [],
): Promise<{ data: EditorialRecord[]; imported: number; files: number }> => {
  let merged = existing;
  let imported = 0;
  for (const file of files) {
    const parsed = await parseExcelFile(file);
    imported += parsed.length;
    merged = mergeRecordSets(merged, parsed);
  }
  return { data: merged, imported, files: files.length };
};

export const makeEmptyData = (): AppData => ({
  version: 3,
  records: [],
  auditLog: [],
  deletedRecords: [],
  importedAt: new Date().toISOString(),
});

export const exportWorkbook = async (records: EditorialRecord[]) => {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Control Editorial Sustainability";
  workbook.created = new Date();
  const processes = workbook.addWorksheet("Procesos");
  const headers = [
    "ID",
    "Cliente",
    "Tema",
    "Producto",
    "Indexación",
    "Estado",
    "Avance (%)",
    "Revista",
    "Usuario",
    "Contraseña",
    "Link revista",
    "Link login",
    "APC",
    "Investigador",
    "Inicio",
    "Fin",
    "Total cliente",
    "Saldo importado/manual",
    "Próximo pago",
    "Fecha próximo pago",
    "Pago investigador",
    "Pagado investigador",
    "Contrato",
    "Orden de producción",
    "Observaciones",
  ];
  processes.addRow(headers);
  records.forEach((record) => {
    processes.addRow([
      record.id,
      record.client,
      record.topic,
      record.product,
      record.indexation,
      record.status,
      record.progress,
      record.journal,
      record.username,
      record.password,
      record.journalLink,
      record.loginLink,
      record.apcValue,
      record.investigator,
      record.startDate,
      record.endDate,
      record.clientTotal,
      record.outstandingBalance,
      record.nextPaymentAmount,
      record.nextPaymentDate,
      record.investigatorPayment,
      record.investigatorPaid,
      record.contractNumber,
      record.productionOrder,
      record.observations,
    ]);
  });
  processes.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  processes.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173F3A" } };
  processes.views = [{ state: "frozen", ySplit: 1 }];
  processes.autoFilter = { from: "A1", to: `Y${records.length + 1}` };
  processes.columns.forEach((column, index) => {
    column.width = [14, 26, 42, 18, 16, 24, 12, 24, 20, 18, 32, 32, 14, 24, 14, 14, 16, 18, 16, 18, 18, 20, 22, 22, 44][index] || 18;
  });

  const payments = workbook.addWorksheet("Pagos cliente");
  payments.addRow(["Cliente", "Contrato", "Concepto", "Fecha prevista", "Fecha pagada", "Monto", "Estado", "Nota"]);
  records.forEach((record) =>
    record.clientPayments.forEach((payment) =>
      payments.addRow([
        record.client,
        record.contractNumber,
        payment.concept,
        payment.scheduledDate,
        payment.paidDate,
        payment.amount,
        payment.status,
        payment.note,
      ]),
    ),
  );
  payments.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  payments.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D7268" } };
  payments.views = [{ state: "frozen", ySplit: 1 }];
  payments.columns = [26, 22, 22, 18, 18, 16, 16, 40].map((width) => ({ width }));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `control-editorial-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
};
