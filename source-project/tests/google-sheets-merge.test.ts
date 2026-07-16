import assert from "node:assert/strict";
import test from "node:test";
import { mergeGoogleSnapshot, normalizeAppData } from "../lib/google-sheets";
import { blankRecord } from "../lib/format";
import type { AppData, EditorialRecord } from "../lib/types";

const record = (id: string, client: string, updatedAt: string): EditorialRecord => ({
  ...blankRecord(),
  id,
  client,
  username: "usuario-local",
  password: "secreto-local",
  updatedAt,
});

const base = (records: EditorialRecord[]): AppData => normalizeAppData({
  version: 4,
  records,
  investigators: [],
  auditLog: [],
  deletedRecords: [],
  importedAt: "2026-01-01T00:00:00.000Z",
});

test("combina por ID y conserva la version mas reciente", () => {
  const local = base([record("a", "Cliente local", "2026-02-01T00:00:00.000Z")]);
  const remoteA = record("a", "Cliente remoto antiguo", "2026-01-01T00:00:00.000Z");
  const remoteB = record("b", "Cliente remoto", "2026-03-01T00:00:00.000Z");
  const merged = mergeGoogleSnapshot(local, {
    schemaVersion: 2,
    revision: 4,
    serverTime: "2026-03-01T00:00:00.000Z",
    records: [remoteA, remoteB],
    investigators: [],
    auditLog: [],
    deletedRecords: [],
  });
  assert.equal(merged.records.length, 2);
  assert.equal(merged.records.find((item) => item.id === "a")?.client, "Cliente local");
});

test("respeta eliminaciones y no borra credenciales de acceso omitidas", () => {
  const localA = record("a", "Cliente", "2026-02-01T00:00:00.000Z");
  localA.journalAccesses = [{ id: "journal-1", journal: "Revista A", journalLink: "", loginLink: "", username: "revista-local", password: "clave-local" }];
  const localB = record("b", "Eliminar", "2026-02-01T00:00:00.000Z");
  const remoteA = { ...localA, client: "Cliente actualizado", username: "", password: "", journalAccesses: localA.journalAccesses.map((item) => ({ ...item, username: "", password: "" })), updatedAt: "2026-03-01T00:00:00.000Z" };
  const merged = mergeGoogleSnapshot(base([localA, localB]), {
    schemaVersion: 2,
    revision: 8,
    serverTime: "2026-04-01T00:00:00.000Z",
    records: [remoteA],
    investigators: [],
    auditLog: [],
    deletedRecords: [{ id: "b", deletedAt: "2026-04-01T00:00:00.000Z" }],
  });
  assert.equal(merged.records.some((item) => item.id === "b"), false);
  assert.equal(merged.records[0].client, "Cliente actualizado");
  assert.equal(merged.records[0].username, "usuario-local");
  assert.equal(merged.records[0].password, "secreto-local");
  assert.equal(merged.records[0].journalAccesses[0].username, "revista-local");
  assert.equal(merged.records[0].journalAccesses[0].password, "clave-local");
});

test("migra campos anteriores al formato unificado", () => {
  const legacy = record("legacy", "Cliente anterior", "2025-01-01T00:00:00.000Z");
  legacy.startDate = "2025-02-01";
  legacy.endDate = "2025-12-01";
  legacy.apcValue = 750;
  legacy.journal = "Revista heredada";
  legacy.journalLink = "https://example.com/revista";
  legacy.contractStartDate = "";
  legacy.contractEndDate = "";
  legacy.journalAccesses = [];
  delete (legacy as Partial<EditorialRecord>).hasApc;
  const normalized = normalizeAppData({
    version: 2,
    records: [legacy],
    investigators: [],
    auditLog: [],
    deletedRecords: [],
    importedAt: "2025-01-01T00:00:00.000Z",
  });
  assert.equal(normalized.version, 4);
  assert.equal(normalized.records[0].contractStartDate, "2025-02-01");
  assert.equal(normalized.records[0].contractEndDate, "2025-12-01");
  assert.equal(normalized.records[0].hasApc, true);
  assert.equal(normalized.records[0].journalAccesses[0].journal, "Revista heredada");
});

test("agrupa y conserva el investigador con la actualización más reciente", () => {
  const local = base([]);
  local.investigators = [{ id: "i-1", name: "Ana Pérez", documentId: "", email: "", phone: "", specialty: "Local", startDate: "", endDate: "", driveFolderUrl: "", notes: "", active: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }];
  const merged = mergeGoogleSnapshot(local, {
    schemaVersion: 2,
    revision: 2,
    serverTime: "2026-02-01T00:00:00.000Z",
    records: [],
    investigators: [{ ...local.investigators[0], specialty: "Scopus", updatedAt: "2026-02-01T00:00:00.000Z" }],
    auditLog: [],
    deletedRecords: [],
  });
  assert.equal(merged.investigators.length, 1);
  assert.equal(merged.investigators[0].specialty, "Scopus");
});
