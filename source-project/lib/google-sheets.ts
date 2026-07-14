import type {
  AppData,
  AuditEntry,
  DeletedRecord,
  EditorialRecord,
  GoogleSheetsConfig,
} from "./types";

export interface GoogleSheetsSnapshot {
  revision: number;
  serverTime: string;
  records: EditorialRecord[];
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

export const normalizeAppData = (data: AppData): AppData => ({
  ...data,
  version: 3,
  records: Array.isArray(data.records) ? data.records : [],
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

const isoTime = (value: string | undefined) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
};

const normalizeRecord = (record: EditorialRecord): EditorialRecord => ({
  ...record,
  clientPayments: Array.isArray(record.clientPayments) ? record.clientPayments : [],
  sources: Array.isArray(record.sources) ? record.sources : [],
});

const mergeRecord = (
  local: EditorialRecord | undefined,
  remote: EditorialRecord | undefined,
) => {
  if (!local) return remote ? normalizeRecord(remote) : undefined;
  if (!remote) return normalizeRecord(local);
  const remoteWins = isoTime(remote.updatedAt) > isoTime(local.updatedAt);
  const selected = normalizeRecord(remoteWins ? remote : local);
  const other = remoteWins ? local : remote;
  return {
    ...selected,
    username: selected.username || other.username,
    password: selected.password || other.password,
  };
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
  revision: Number(result.revision || 0),
  serverTime: result.serverTime || new Date().toISOString(),
  records: Array.isArray(result.records) ? result.records.map(normalizeRecord) : [],
  auditLog: Array.isArray(result.auditLog) ? result.auditLog : [],
  deletedRecords: Array.isArray(result.deletedRecords) ? result.deletedRecords : [],
});

export const testGoogleSheetsConnection = async (config: GoogleSheetsConfig) => {
  const result = await post(config, "ping");
  return {
    revision: Number(result.revision || 0),
    records: Number(result.recordCount || 0),
    payments: Number(result.paymentCount || 0),
    serverTime: result.serverTime || "",
  };
};

export const pullGoogleSheets = async (config: GoogleSheetsConfig) =>
  responseSnapshot(await post(config, "pull"));

const recordsForSync = (records: EditorialRecord[], includeCredentials: boolean) =>
  records.map((record) => includeCredentials
    ? record
    : { ...record, username: "", password: "" });

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
        auditLog: merged.auditLog,
        deletedRecords: merged.deletedRecords || [],
      });
      const remoteRevision = Number(result.revision || remote.revision + 1);
      const lastSyncAt = result.serverTime || new Date().toISOString();
      return {
        data: normalizeAppData({
          ...merged,
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
