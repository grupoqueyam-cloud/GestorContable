import assert from "node:assert/strict";
import test from "node:test";
import { mergeGoogleSnapshot, normalizeAppData } from "../lib/google-sheets";
import { blankRecord, clientBalance, clientPaymentState, paidByClient, statusProgress } from "../lib/format";
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
  version: 7,
  records,
  investigators: [],
  sellers: [],
  auditLog: [],
  deletedRecords: [],
  importedAt: "2026-01-01T00:00:00.000Z",
});

test("combina por ID y conserva la version mas reciente", () => {
  const local = base([record("a", "Cliente local", "2026-02-01T00:00:00.000Z")]);
  const remoteA = record("a", "Cliente remoto antiguo", "2026-01-01T00:00:00.000Z");
  const remoteB = record("b", "Cliente remoto", "2026-03-01T00:00:00.000Z");
  const merged = mergeGoogleSnapshot(local, {
    schemaVersion: 5,
    revision: 4,
    serverTime: "2026-03-01T00:00:00.000Z",
    records: [remoteA, remoteB],
    investigators: [],
    sellers: [],
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
    schemaVersion: 5,
    revision: 8,
    serverTime: "2026-04-01T00:00:00.000Z",
    records: [remoteA],
    investigators: [],
    sellers: [],
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
  legacy.investigator = "Investigador heredado";
  legacy.previousInvestigator = "Investigador anterior";
  legacy.investigatorStartDate = "2025-03-01";
  legacy.investigatorEndDate = "2025-10-01";
  legacy.investigatorPayment = 1000;
  legacy.investigatorPaid = 300;
  delete (legacy as Partial<EditorialRecord>).hasApc;
  const normalized = normalizeAppData({
    version: 2,
    records: [legacy],
    investigators: [],
    sellers: [],
    auditLog: [],
    deletedRecords: [],
    importedAt: "2025-01-01T00:00:00.000Z",
  });
  assert.equal(normalized.version, 7);
  assert.equal(normalized.records[0].contractStartDate, "2025-02-01");
  assert.equal(normalized.records[0].contractEndDate, "");
  assert.equal(normalized.records[0].hasApc, true);
  assert.equal(normalized.records[0].journalAccesses[0].journal, "Revista heredada");
  assert.equal(normalized.records[0].investigatorHistory.length, 2);
  assert.equal(normalized.records[0].investigatorHistory[0].investigator, "Investigador anterior");
  assert.equal(normalized.records[0].investigatorHistory[0].isCurrent, false);
  assert.equal(normalized.records[0].investigatorHistory[0].installments.length, 2);
  assert.equal(normalized.records[0].investigatorHistory[1].investigator, "Investigador heredado");
  assert.equal(normalized.records[0].investigatorHistory[1].isCurrent, true);
  assert.equal(normalized.records[0].investigatorHistory[1].installments[0].paidAmount, 300);
  assert.equal(normalized.records[0].investigatorHistory[1].installments[1].paidAmount, 0);
  assert.equal(normalized.records[0].investigatorPaid, 300);
});

test("agrupa y conserva el investigador con la actualización más reciente", () => {
  const local = base([]);
  local.investigators = [{ id: "i-1", name: "Ana Pérez", documentId: "", email: "", phone: "", specialty: "Local", startDate: "", endDate: "", driveFolderUrl: "", notes: "", active: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }];
  const merged = mergeGoogleSnapshot(local, {
    schemaVersion: 5,
    revision: 2,
    serverTime: "2026-02-01T00:00:00.000Z",
    records: [],
    investigators: [{ ...local.investigators[0], specialty: "Scopus", updatedAt: "2026-02-01T00:00:00.000Z" }],
    sellers: [],
    auditLog: [],
    deletedRecords: [],
  });
  assert.equal(merged.investigators.length, 1);
  assert.equal(merged.investigators[0].specialty, "Scopus");
});

test("conserva todo el historial y solo un investigador como responsable actual", () => {
  const process = record("history", "Cliente historial", "2026-05-01T00:00:00.000Z");
  process.investigatorHistory = [
    {
      id: "assignment-1",
      investigator: "Ana Pérez",
      startDate: "2026-01-01",
      endDate: "2026-02-28",
      agreedPayment: 600,
      paymentMode: "dos_abonos",
      installments: [
        { number: 1, amount: 300, paidAmount: 300, scheduledDate: "2026-01-31", paidDate: "2026-01-30", status: "pagado" },
        { number: 2, amount: 300, paidAmount: 300, scheduledDate: "2026-02-28", paidDate: "2026-02-28", status: "pagado" },
      ],
      notes: "Primera responsable",
      isCurrent: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-28T00:00:00.000Z",
    },
    {
      id: "assignment-2",
      investigator: "Beatriz Ruiz",
      startDate: "2026-03-01",
      endDate: "2026-06-30",
      agreedPayment: 800,
      paymentMode: "dos_abonos",
      installments: [
        { number: 1, amount: 400, paidAmount: 200, scheduledDate: "2026-04-01", paidDate: "2026-04-01", status: "parcial" },
        { number: 2, amount: 400, paidAmount: 0, scheduledDate: "2026-06-30", paidDate: "", status: "pendiente" },
      ],
      notes: "Responsable actual",
      isCurrent: true,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  ];

  const normalized = normalizeAppData(base([process]));
  const result = normalized.records[0];
  assert.equal(result.investigatorHistory.length, 2);
  assert.deepEqual(result.investigatorHistory.map((item) => item.isCurrent), [false, true]);
  assert.equal(result.investigator, "Beatriz Ruiz");
  assert.equal(result.previousInvestigator, "Ana Pérez");
  assert.equal(result.investigatorPayment, 800);
  assert.equal(result.investigatorPaid, 200);
  assert.equal(result.investigatorHistory[1].installments[0].status, "parcial");
  assert.equal(result.investigatorHistory[1].installments[1].status, "pendiente");
});

test("normaliza pagos heredados de investigador en dos abonos", () => {
  const process = record("installments", "Cliente abonos", "2026-06-01T00:00:00.000Z");
  process.investigatorHistory = [{
    id: "assignment-installments",
    investigator: "Carlos Mora",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    agreedPayment: 1000,
    paymentMode: "dos_abonos",
    installments: [
      { number: 1, amount: 500, paidAmount: 900, scheduledDate: "2026-03-01", paidDate: "2026-03-01", status: "pendiente" },
    ] as unknown as EditorialRecord["investigatorHistory"][number]["installments"],
    notes: "",
    isCurrent: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  }];

  const assignment = normalizeAppData(base([process])).records[0].investigatorHistory[0];
  assert.equal(assignment.installments.length, 2);
  assert.deepEqual(assignment.installments.map((item) => item.number), [1, 2]);
  assert.equal(assignment.installments[0].paidAmount, 500);
  assert.equal(assignment.installments[0].status, "pagado");
  assert.equal(assignment.installments[1].amount, 500);
  assert.equal(assignment.installments[1].paidAmount, 0);
  assert.equal(assignment.installments[1].status, "pendiente");
});

test("no pierde un pago heredado aunque supere el honorario registrado", () => {
  const process = record("legacy-overpayment", "Cliente pago heredado", "2026-06-01T00:00:00.000Z");
  process.investigator = "Daniel León";
  process.investigatorPayment = 100;
  process.investigatorPaid = 180;

  const result = normalizeAppData(base([process])).records[0];
  const assignment = result.investigatorHistory[0];
  assert.equal(assignment.agreedPayment, 180);
  assert.equal(assignment.installments.reduce((sum, item) => sum + item.paidAmount, 0), 180);
  assert.equal(result.investigatorPaid, 180);
});

test("calcula el saldo con pagos completos y parciales sin dejar deuda pagada", () => {
  const process = record("client-payments", "Cliente pagos", "2026-06-01T00:00:00.000Z");
  process.clientTotal = 1000;
  process.outstandingBalance = 1000;
  process.clientPayments = [
    { id: "payment-1", concept: "Primer pago", scheduledDate: "", paidDate: "2026-01-01", amount: 600, paidAmount: 600, status: "pagado", note: "" },
    { id: "payment-2", concept: "Segundo pago", scheduledDate: "", paidDate: "2026-02-01", amount: 400, paidAmount: 400, status: "pagado", note: "" },
  ];
  assert.equal(paidByClient(process), 1000);
  assert.equal(clientBalance(process), 0);

  process.clientPayments[1] = { ...process.clientPayments[1], paidAmount: 150, status: "parcial" };
  assert.equal(paidByClient(process), 750);
  assert.equal(clientBalance(process), 250);
});

test("migra pagos antiguos marcados como pagados al nuevo valor pagado", () => {
  const process = record("legacy-client-payment", "Cliente pago antiguo", "2026-06-01T00:00:00.000Z");
  process.clientTotal = 300;
  process.clientPayments = [{
    id: "legacy-payment",
    concept: "Pago total",
    scheduledDate: "",
    paidDate: "2026-05-01",
    amount: 300,
    status: "pagado",
    note: "",
  } as unknown as EditorialRecord["clientPayments"][number]];
  const normalized = normalizeAppData(base([process])).records[0];
  assert.equal(normalized.clientPayments[0].paidAmount, 300);
  assert.equal(clientBalance(normalized), 0);
});

test("descuenta un abono aunque el estado recibido todavía diga pendiente", () => {
  const process = record("stale-payment-status", "Cliente abono", "2026-06-01T00:00:00.000Z");
  process.clientTotal = 1000;
  process.outstandingBalance = 1000;
  process.clientPayments = [{
    id: "partial-payment",
    concept: "Abono",
    scheduledDate: "",
    paidDate: "2026-06-01",
    amount: 1000,
    paidAmount: 275,
    status: "pendiente",
    note: "",
  }];
  assert.equal(paidByClient(process), 275);
  assert.equal(clientBalance(process), 725);
  assert.equal(clientPaymentState(process), "parcial");

  const normalized = normalizeAppData(base([process])).records[0];
  assert.equal(normalized.clientPayments[0].status, "parcial");
  assert.equal(normalized.outstandingBalance, 725);
});

test("migra vendedor y conserva país y origen del cliente", () => {
  const process = record("seller-migration", "Cliente internacional", "2026-06-01T00:00:00.000Z");
  process.seller = "María Comercial";
  process.clientCountry = "Colombia";
  process.clientType = "Nuevo";
  process.contactMedium = "Recomendación";
  process.referredBy = "Cliente anterior";
  const normalized = normalizeAppData({
    ...base([process]),
    sellers: [],
  });
  assert.equal(normalized.sellers[0].name, "María Comercial");
  assert.equal(normalized.records[0].clientCountry, "Colombia");
  assert.equal(normalized.records[0].contactMedium, "Recomendación");
  assert.equal(normalized.records[0].referredBy, "Cliente anterior");
});

test("aplica los porcentajes editoriales solicitados", () => {
  assert.equal(statusProgress("Por asignar"), 0);
  assert.equal(statusProgress("Elaboración"), 25);
  assert.equal(statusProgress("Enviado a la revista"), 50);
  assert.equal(statusProgress("Revisión Pares"), 75);
  assert.equal(statusProgress("Publicado"), 100);
});

test("conserva modalidad de pago único con un segundo abono vacío", () => {
  const process = record("single-payment", "Cliente pago único", "2026-06-01T00:00:00.000Z");
  process.investigatorHistory = [{
    id: "assignment-single",
    investigator: "Elena López",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    agreedPayment: 500,
    paymentMode: "unico",
    installments: [
      { number: 1, amount: 500, paidAmount: 500, scheduledDate: "", paidDate: "2026-03-01", status: "pagado" },
      { number: 2, amount: 250, paidAmount: 0, scheduledDate: "2026-04-01", paidDate: "", status: "pendiente" },
    ],
    notes: "",
    isCurrent: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  }];
  const assignment = normalizeAppData(base([process])).records[0].investigatorHistory[0];
  assert.equal(assignment.paymentMode, "unico");
  assert.equal(assignment.installments[0].amount, 500);
  assert.equal(assignment.installments[0].paidAmount, 500);
  assert.equal(assignment.installments[1].amount, 0);
  assert.equal(assignment.installments[1].paidAmount, 0);
});
