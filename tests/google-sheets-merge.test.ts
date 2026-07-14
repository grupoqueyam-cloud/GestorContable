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
  version: 3,
  records,
  auditLog: [],
  deletedRecords: [],
  importedAt: "2026-01-01T00:00:00.000Z",
});

test("combina por ID y conserva la version mas reciente", () => {
  const local = base([record("a", "Cliente local", "2026-02-01T00:00:00.000Z")]);
  const remoteA = record("a", "Cliente remoto antiguo", "2026-01-01T00:00:00.000Z");
  const remoteB = record("b", "Cliente remoto", "2026-03-01T00:00:00.000Z");
  const merged = mergeGoogleSnapshot(local, {
    revision: 4,
    serverTime: "2026-03-01T00:00:00.000Z",
    records: [remoteA, remoteB],
    auditLog: [],
    deletedRecords: [],
  });
  assert.equal(merged.records.length, 2);
  assert.equal(merged.records.find((item) => item.id === "a")?.client, "Cliente local");
});

test("respeta eliminaciones y no borra credenciales locales omitidas", () => {
  const localA = record("a", "Cliente", "2026-02-01T00:00:00.000Z");
  const localB = record("b", "Eliminar", "2026-02-01T00:00:00.000Z");
  const remoteA = { ...localA, client: "Cliente actualizado", username: "", password: "", updatedAt: "2026-03-01T00:00:00.000Z" };
  const merged = mergeGoogleSnapshot(base([localA, localB]), {
    revision: 8,
    serverTime: "2026-04-01T00:00:00.000Z",
    records: [remoteA],
    auditLog: [],
    deletedRecords: [{ id: "b", deletedAt: "2026-04-01T00:00:00.000Z" }],
  });
  assert.equal(merged.records.some((item) => item.id === "b"), false);
  assert.equal(merged.records[0].client, "Cliente actualizado");
  assert.equal(merged.records[0].username, "usuario-local");
  assert.equal(merged.records[0].password, "secreto-local");
});
