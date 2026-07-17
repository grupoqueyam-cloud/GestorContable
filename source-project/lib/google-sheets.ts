import type {
  AppData,
  AuditEntry,
  DeletedRecord,
  EditorialRecord,
  GoogleSheetsConfig,
  Investigator,
  InvestigatorAssignment,
  InvestigatorInstallment,
  JournalAccess,
} from "./types";

const REQUIRED_SCHEMA_VERSION = 3;

export interface GoogleSheetsSnapshot {
  schemaVersion: number;
  revision: number;
  serverTime: string;
  records: EditorialRecord[];
  investigators: Investigator[];
  auditLog: AuditEntry[];
  deletedRecords: DeletedRecord[];
}

interface ApiResponse extends Partial<GoogleSheetsSnapshot> {
  ok: boolean;
  code?: string;
  message?: string;
  service?: string;
  recordCount?: number;
  paymentCount?: number;
  investigatorCount?: number;
  clientCount?: number;
  assignmentCount?: number;
  snapshot?: GoogleSheetsSnapshot;
}

export interface SyncResult {
  data: AppData;
  remoteRevision: number;
  localBefore: number;
  remoteBefore: number;
  mergedCount: number;
}

export class GoogleSheetsError extends Error {
  code: string;
  snapshot?: GoogleSheetsSnapshot;

  constructor(message: string, code = "SHEETS_ERROR", snapshot?: GoogleSheetsSnapshot) {
    super(message);
    this.name = "GoogleSheetsError";
    this.code = code;
    this.snapshot = snapshot;
  }
}

export const emptyGoogleSheetsConfig = (): GoogleSheetsConfig => ({
  webAppUrl: "",
  syncToken: "",
  autoSync: false,
  includeCredentials: false,
  remoteRevision: 0,
  lastSyncAt: "",
});

const isoTime = (value: string | undefined) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
};

const normalizeJournalAccesses = (record: EditorialRecord): JournalAccess[] => {
  const current = Array.isArray(record.journalAccesses) ? record.journalAccesses : [];
  const legacyHasData = [record.journal, record.journalLink, record.loginLink, record.username, record.password].some(Boolean);
  const source = current.length || !legacyHasData
    ? current
    : [{
        id: `${record.id || "legacy"}-journal-1`,
        journal: record.journal || "",
        journalLink: record.journalLink || "",
        loginLink: record.loginLink || "",
        username: record.username || "",
        password: record.password || "",
      }];
  return source.map((item, index) => ({
    id: item.id || `${record.id || "journal"}-${index + 1}`,
    journal: item.journal || "",
    journalLink: item.journalLink || "",
    loginLink: item.loginLink || "",
    username: item.username || "",
    password: item.password || "",
  }));
};

const installmentStatus = (paidAmount: number, amount: number) => {
  if (amount > 0 && paidAmount >= amount) return "pagado" as const;
  if (paidAmount > 0) return "parcial" as const;
  return "pendiente" as const;
};

const normalizeInstallment = (
  raw: Partial<InvestigatorInstallment> | undefined,
  number: 1 | 2,
  fallbackAmount = 0,
): InvestigatorInstallment => {
  const amount = Math.max(0, Number(raw?.amount) || fallbackAmount);
  const paidAmount = Math.max(0, Math.min(Number(raw?.paidAmount) || 0, amount || Number(raw?.paidAmount) || 0));
  return {
    number,
    amount,
    paidAmount,
    scheduledDate: raw?.scheduledDate || "",
    paidDate: raw?.paidDate || "",
    status: installmentStatus(paidAmount, amount),
  };
};

const legacyAssignments = (record: EditorialRecord): InvestigatorAssignment[] => {
  const currentInvestigator = String(record.investigator || "").trim();
  const previousInvestigator = String(record.previousInvestigator || "").trim();
  if (!currentInvestigator && !previousInvestigator) return [];
  const paid = Math.max(0, Number(record.investigatorPaid) || 0);
  const fee = Math.max(0, Number(record.investigatorPayment) || 0, paid);
  const firstAmount = Math.round((fee / 2) * 100) / 100;
  const secondAmount = Math.max(0, Math.round((fee - firstAmount) * 100) / 100);
  const firstPaid = Math.min(paid, firstAmount || paid);
  const secondPaid = Math.max(0, Math.min(paid - firstPaid, secondAmount));
  const now = record.updatedAt || new Date().toISOString();
  const history: InvestigatorAssignment[] = [];
  if (previousInvestigator && previousInvestigator.toLocaleUpperCase("es") !== currentInvestigator.toLocaleUpperCase("es")) {
    history.push({
      id: `${record.id || "legacy"}-assignment-previous`,
      investigator: previousInvestigator,
      startDate: record.contractStartDate || record.startDate || "",
      endDate: record.investigatorStartDate || record.endDate || record.contractEndDate || "",
      agreedPayment: 0,
      installments: [normalizeInstallment(undefined, 1), normalizeInstallment(undefined, 2)],
      notes: "Migrado como investigador anterior; revise fechas y honorarios",
      isCurrent: false,
      createdAt: record.createdAt || now,
      updatedAt: now,
    });
  }
  if (!currentInvestigator) return history;
  history.push({
    id: `${record.id || "legacy"}-assignment-1`,
    investigator: currentInvestigator,
    startDate: record.investigatorStartDate || record.startDate || "",
    endDate: record.investigatorEndDate || record.endDate || "",
    agreedPayment: fee,
    installments: [
      normalizeInstallment({ amount: firstAmount, paidAmount: firstPaid }, 1),
      normalizeInstallment({ amount: secondAmount, paidAmount: secondPaid }, 2),
    ],
    notes: "Migrado desde el registro anterior",
    isCurrent: true,
    createdAt: record.createdAt || now,
    updatedAt: now,
  });
  return history;
};

const normalizeInvestigatorHistory = (record: EditorialRecord): InvestigatorAssignment[] => {
  const source = Array.isArray(record.investigatorHistory) && record.investigatorHistory.length
    ? record.investigatorHistory
    : legacyAssignments(record);
  const normalized = source.filter((item) => item?.investigator).map((item, index) => {
    const fee = Math.max(0, Number(item.agreedPayment) || 0);
    const half = Math.round((fee / 2) * 100) / 100;
    const installments = Array.isArray(item.installments) ? item.installments : [];
    return {
      id: item.id || `${record.id || "process"}-assignment-${index + 1}`,
      investigator: item.investigator || "",
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      agreedPayment: fee,
      installments: [
        normalizeInstallment(installments[0], 1, half),
        normalizeInstallment(installments[1], 2, Math.max(0, fee - half)),
      ] as [InvestigatorInstallment, InvestigatorInstallment],
      notes: item.notes || "",
      isCurrent: Boolean(item.isCurrent),
      createdAt: item.createdAt || record.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || record.updatedAt || new Date().toISOString(),
    };
  });
  if (!normalized.length) return [];
  const currentIndex = normalized.map((item) => item.isCurrent).lastIndexOf(true);
  const selected = currentIndex >= 0 ? currentIndex : normalized.length - 1;
  return normalized.map((item, index) => ({ ...item, isCurrent: index === selected }));
};

const normalizeRecord = (record: EditorialRecord): EditorialRecord => {
  const journalAccesses = normalizeJournalAccesses(record);
  const primary = journalAccesses[0];
  const investigatorHistory = normalizeInvestigatorHistory(record);
  const currentAssignment = investigatorHistory.find((item) => item.isCurrent) || investigatorHistory.at(-1);
  const previousAssignment = [...investigatorHistory].reverse().find((item) => item.id !== currentAssignment?.id);
  const currentPaid = currentAssignment?.installments.reduce((sum, item) => sum + item.paidAmount, 0) || 0;
  return {
    ...record,
    operationalStatus: record.operationalStatus || "Normal",
    hasApc: typeof record.hasApc === "boolean" ? record.hasApc : Number(record.apcValue) > 0,
    journalAccesses,
    journal: record.journal || primary?.journal || "",
    journalLink: record.journalLink || primary?.journalLink || "",
    loginLink: record.loginLink || primary?.loginLink || "",
    username: record.username || primary?.username || "",
    password: record.password || primary?.password || "",
    contractStartDate: record.contractStartDate || record.startDate || "",
    contractEndDate: record.contractEndDate || record.endDate || "",
    contractLink: record.contractLink || "",
    investigator: currentAssignment?.investigator || record.investigator || "",
    previousInvestigator: previousAssignment?.investigator || record.previousInvestigator || "",
    investigatorStartDate: currentAssignment?.startDate || record.investigatorStartDate || "",
    investigatorEndDate: currentAssignment?.endDate || record.investigatorEndDate || "",
    investigatorPayment: currentAssignment?.agreedPayment ?? (Number(record.investigatorPayment) || 0),
    investigatorPaid: currentAssignment ? currentPaid : (Number(record.investigatorPaid) || 0),
    investigatorHistory,
    investigatorInvoiceNumber: record.investigatorInvoiceNumber || "",
    investigatorInvoiceDate: record.investigatorInvoiceDate || "",
    investigatorInvoiceValue: Number(record.investigatorInvoiceValue) || 0,
    investigatorInvoiceLink: record.investigatorInvoiceLink || "",
    investigatorInvoiceStatus: record.investigatorInvoiceStatus || "Pendiente",
    clientPhone: record.clientPhone || "",
    clientAddress: record.clientAddress || "",
    clientInstitution: record.clientInstitution || "",
    driveFiles: Array.isArray(record.driveFiles) ? record.driveFiles : [],
    clientPayments: Array.isArray(record.clientPayments) ? record.clientPayments : [],
    sources: Array.isArray(record.sources) ? record.sources : [],
  };
};

const normalizeInvestigator = (investigator: Investigator): Investigator => ({
  ...investigator,
  name: investigator.name || "",
  documentId: investigator.documentId || "",
  email: investigator.email || "",
  phone: investigator.phone || "",
  specialty: investigator.specialty || "",
  startDate: investigator.startDate || "",
  endDate: investigator.endDate || "",
  driveFolderUrl: investigator.driveFolderUrl || "",
  notes: investigator.notes || "",
  active: investigator.active !== false,
  createdAt: investigator.createdAt || new Date().toISOString(),
  updatedAt: investigator.updatedAt || new Date().toISOString(),
});

export const normalizeAppData = (data: AppData): AppData => ({
  ...data,
  version: 5,
  records: Array.isArray(data.records) ? data.records.map(normalizeRecord) : [],
  investigators: Array.isArray(data.investigators) ? data.investigators.map(normalizeInvestigator) : [],
  auditLog: Array.isArray(data.auditLog) ? data.auditLog : [],
  deletedRecords: Array.isArray(data.deletedRecords) ? data.deletedRecords : [],
  googleSheets: data.googleSheets
    ? { ...emptyGoogleSheetsConfig(), ...data.googleSheets }
    : undefined,
});

export const isValidWebAppUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:"
      && (url.hostname === "script.google.com" || url.hostname.endsWith(".googleusercontent.com"))
      && url.pathname.includes("/macros/")
      && url.pathname.endsWith("/exec");
  } catch {
    return false;
  }
};

const journalKey = (item: JournalAccess) => item.id || `${item.journal}|${item.journalLink}|${item.loginLink}`;

const preserveJournalCredentials = (selected: EditorialRecord, other: EditorialRecord) => {
  const previous = new Map(other.journalAccesses.map((item) => [journalKey(item), item]));
  return selected.journalAccesses.map((item) => {
    const stored = previous.get(journalKey(item));
    return {
      ...item,
      username: item.username || stored?.username || "",
      password: item.password || stored?.password || "",
    };
  });
};

const mergeRecord = (
  local: EditorialRecord | undefined,
  remote: EditorialRecord | undefined,
) => {
  if (!local) return remote ? normalizeRecord(remote) : undefined;
  if (!remote) return normalizeRecord(local);
  const remoteWins = isoTime(remote.updatedAt) > isoTime(local.updatedAt);
  const selected = normalizeRecord(remoteWins ? remote : local);
  const other = normalizeRecord(remoteWins ? local : remote);
  return {
    ...selected,
    username: selected.username || other.username,
    password: selected.password || other.password,
    journalAccesses: preserveJournalCredentials(selected, other),
  };
};

const mergeInvestigators = (local: Investigator[], remote: Investigator[]) => {
  const merged = new Map<string, Investigator>();
  [...remote, ...local].forEach((raw) => {
    const item = normalizeInvestigator(raw);
    if (!item.id && !item.name) return;
    const key = item.id || item.name.toLocaleUpperCase("es");
    const current = merged.get(key);
    if (!current || isoTime(item.updatedAt) >= isoTime(current.updatedAt)) merged.set(key, item);
  });
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
};

const mergeDeleted = (local: DeletedRecord[], remote: DeletedRecord[]) => {
  const merged = new Map<string, DeletedRecord>();
  [...remote, ...local].forEach((item) => {
    if (!item?.id) return;
    const current = merged.get(item.id);
    if (!current || isoTime(item.deletedAt) >= isoTime(current.deletedAt)) merged.set(item.id, item);
  });
  return [...merged.values()].sort((a, b) => isoTime(b.deletedAt) - isoTime(a.deletedAt));
};

const mergeAudit = (local: AuditEntry[], remote: AuditEntry[]) => {
  const merged = new Map<string, AuditEntry>();
  [...remote, ...local].forEach((entry) => {
    if (entry?.id) merged.set(entry.id, entry);
  });
  return [...merged.values()]
    .sort((a, b) => isoTime(b.timestamp) - isoTime(a.timestamp))
    .slice(0, 500);
};

export const mergeGoogleSnapshot = (
  local: AppData,
  remote: GoogleSheetsSnapshot,
): AppData => {
  const records = new Map<string, EditorialRecord>();
  const remoteRecords = new Map(remote.records.map((record) => [record.id, record]));
  const localRecords = new Map(local.records.map((record) => [record.id, record]));
  new Set([...remoteRecords.keys(), ...localRecords.keys()]).forEach((id) => {
    const merged = mergeRecord(localRecords.get(id), remoteRecords.get(id));
    if (merged) records.set(id, merged);
  });

  const deletedRecords = mergeDeleted(local.deletedRecords || [], remote.deletedRecords || []);
  deletedRecords.forEach((deleted) => {
    const record = records.get(deleted.id);
    if (record && isoTime(deleted.deletedAt) >= isoTime(record.updatedAt)) records.delete(deleted.id);
  });

  return normalizeAppData({
    ...local,
    records: [...records.values()].sort((a, b) => a.client.localeCompare(b.client, "es")),
    investigators: mergeInvestigators(local.investigators || [], remote.investigators || []),
    auditLog: mergeAudit(local.auditLog, remote.auditLog || []),
    deletedRecords,
  });
};

const post = async (
  config: GoogleSheetsConfig,
  action: string,
  payload: Record<string, unknown> = {},
) => {
  if (!isValidWebAppUrl(config.webAppUrl)) {
    throw new GoogleSheetsError("La URL debe ser la implementación /exec de Google Apps Script.", "INVALID_URL");
  }
  if (!config.syncToken.trim()) {
    throw new GoogleSheetsError("Ingresa la clave de sincronización configurada en Apps Script.", "MISSING_TOKEN");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(config.webAppUrl.trim(), {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action,
        token: config.syncToken,
        includeCredentials: config.includeCredentials,
        ...payload,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let result: ApiResponse;
    try {
      result = JSON.parse(text) as ApiResponse;
    } catch {
      throw new GoogleSheetsError(
        "Google no devolvió JSON. Revisa que la implementación permita acceso y que uses la URL terminada en /exec.",
        "INVALID_RESPONSE",
      );
    }
    if (!response.ok || !result.ok) {
      throw new GoogleSheetsError(
        result.message || `Google Sheets respondió con estado ${response.status}.`,
        result.code || `HTTP_${response.status}`,
        result.snapshot,
      );
    }
    return result;
  } catch (error) {
    if (error instanceof GoogleSheetsError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GoogleSheetsError("Google Sheets tardó demasiado en responder.", "TIMEOUT");
    }
    throw new GoogleSheetsError(
      "No se pudo conectar con Google Sheets. Revisa la URL, el acceso de la implementación y tu conexión.",
      "NETWORK_ERROR",
    );
  } finally {
    window.clearTimeout(timeout);
  }
};

const responseSnapshot = (result: ApiResponse): GoogleSheetsSnapshot => ({
  schemaVersion: Number(result.schemaVersion || 0),
  revision: Number(result.revision || 0),
  serverTime: result.serverTime || new Date().toISOString(),
  records: Array.isArray(result.records) ? result.records.map(normalizeRecord) : [],
  investigators: Array.isArray(result.investigators) ? result.investigators.map(normalizeInvestigator) : [],
  auditLog: Array.isArray(result.auditLog) ? result.auditLog : [],
  deletedRecords: Array.isArray(result.deletedRecords) ? result.deletedRecords : [],
});

export const testGoogleSheetsConnection = async (config: GoogleSheetsConfig) => {
  const result = await post(config, "ping");
  return {
    revision: Number(result.revision || 0),
    records: Number(result.recordCount || 0),
    payments: Number(result.paymentCount || 0),
    investigators: Number(result.investigatorCount || 0),
    clients: Number(result.clientCount || 0),
    assignments: Number(result.assignmentCount || 0),
    schemaVersion: Number(result.schemaVersion || 0),
    serverTime: result.serverTime || "",
  };
};

export const pullGoogleSheets = async (config: GoogleSheetsConfig) => {
  const result = await post(config, "pull");
  if (Number(result.schemaVersion || 0) < REQUIRED_SCHEMA_VERSION) {
    throw new GoogleSheetsError(
      "La base usa una versión anterior. Actualiza Code.gs, ejecuta configurarHojas y publica una nueva versión de Apps Script.",
      "SCHEMA_UPDATE_REQUIRED",
    );
  }
  return responseSnapshot(result);
};

const recordsForSync = (records: EditorialRecord[], includeCredentials: boolean) =>
  records.map((record) => includeCredentials
    ? record
    : {
        ...record,
        username: "",
        password: "",
        journalAccesses: record.journalAccesses.map((item) => ({ ...item, username: "", password: "" })),
      });

export const syncGoogleSheets = async (source: AppData): Promise<SyncResult> => {
  const data = normalizeAppData(source);
  const config = data.googleSheets;
  if (!config) throw new GoogleSheetsError("Configura primero la conexión con Google Sheets.", "NOT_CONFIGURED");

  let remote = await pullGoogleSheets(config);
  const localBefore = data.records.length;
  const remoteBefore = remote.records.length;
  let merged = mergeGoogleSnapshot(data, remote);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await post(config, "sync", {
        baseRevision: remote.revision,
        records: recordsForSync(merged.records, config.includeCredentials),
        investigators: merged.investigators || [],
        auditLog: merged.auditLog,
        deletedRecords: merged.deletedRecords || [],
      });
      const remoteRevision = Number(result.revision || remote.revision + 1);
      const lastSyncAt = result.serverTime || new Date().toISOString();
      return {
        data: normalizeAppData({
          ...merged,
          version: 5,
          googleSheets: { ...config, remoteRevision, lastSyncAt },
        }),
        remoteRevision,
        localBefore,
        remoteBefore,
        mergedCount: merged.records.length,
      };
    } catch (error) {
      if (!(error instanceof GoogleSheetsError) || error.code !== "REVISION_CONFLICT" || !error.snapshot || attempt > 0) {
        throw error;
      }
      remote = error.snapshot;
      merged = mergeGoogleSnapshot(merged, remote);
    }
  }
  throw new GoogleSheetsError("No fue posible conciliar cambios simultáneos.", "CONFLICT");
};
