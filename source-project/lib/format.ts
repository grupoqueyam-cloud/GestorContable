import type {
  ClientPayment,
  DriveFile,
  EditorialRecord,
  Investigator,
  InvestigatorAssignment,
  InvestigatorInstallment,
  JournalAccess,
  Seller,
} from "./types";

export const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return 0;
  const source = String(value).trim();
  if (!source) return 0;
  const tokens = source.match(/-?\(?\d[\d.,]*\)?/g) || [];
  let raw = (/IVA/i.test(source) && tokens.length > 1 ? tokens[tokens.length - 1] : tokens[0]) || "";
  if (!raw) return 0;
  const negative = /^\(.*\)$/.test(raw);
  raw = raw.replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma > dot) raw = raw.replace(/\./g, "").replace(",", ".");
  else raw = raw.replace(/,/g, "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : 0;
};

export const toDate = (value: unknown): string => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && value > 20000 && value < 100000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(value));
    return epoch.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const latin = raw.match(/^([0-3]?\d)[/-]([01]?\d)[/-](\d{2,4})$/);
  if (latin) {
    const year = latin[3].length === 2 ? `20${latin[3]}` : latin[3];
    return `${year}-${latin[2].padStart(2, "0")}-${latin[1].padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

export const formatDate = (value: string) => {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

export const statusProgress = (status: string) => {
  const text = normalizeText(status).toUpperCase();
  if (/PUBLICAD|FINALIZAD|CERRAD/.test(text)) return 100;
  if (/PARES|REVISION/.test(text)) return 75;
  if (/ENVIAD|SUBID|REVISTA|ACEPTAD/.test(text)) return 50;
  if (/ELABOR|DESARROLL|PROCESO|CORRECCION/.test(text)) return 25;
  if (/POR.*ASIGNAR|SIN.*ASIGNAR|PENDIENTE/.test(text)) return 0;
  return 0;
};

export const blankPayment = (concept = "Próximo pago"): ClientPayment => ({
  id: uid(),
  concept,
  scheduledDate: "",
  paidDate: "",
  amount: 0,
  paidAmount: 0,
  status: "pendiente",
  note: "",
});

export const blankReceivedPayment = (): ClientPayment => ({
  ...blankPayment("Abono recibido"),
  paidDate: new Date().toISOString().slice(0, 10),
  status: "pagado",
});

export const blankJournalAccess = (): JournalAccess => ({
  id: uid(),
  journal: "",
  journalLink: "",
  loginLink: "",
  username: "",
  password: "",
});

export const blankDriveFile = (): DriveFile => ({
  id: uid(),
  name: "",
  category: "Contrato",
  url: "",
});

export const blankInvestigator = (): Investigator => {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: "",
    documentId: "",
    email: "",
    phone: "",
    specialty: "",
    startDate: "",
    endDate: "",
    driveFolderUrl: "",
    notes: "",
    active: true,
    createdAt: now,
    updatedAt: now,
  };
};

export const blankSeller = (): Seller => {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: "",
    documentId: "",
    email: "",
    phone: "",
    startDate: "",
    endDate: "",
    notes: "",
    active: true,
    createdAt: now,
    updatedAt: now,
  };
};

export const blankInvestigatorInstallment = (number: 1 | 2, amount = 0): InvestigatorInstallment => ({
  number,
  amount,
  paidAmount: 0,
  scheduledDate: "",
  paidDate: "",
  status: "pendiente",
});

export const blankInvestigatorAssignment = (investigator = ""): InvestigatorAssignment => {
  const now = new Date().toISOString();
  return {
    id: uid(),
    investigator,
    startDate: "",
    endDate: "",
    agreedPayment: 0,
    paymentMode: "dos_abonos",
    installments: [blankInvestigatorInstallment(1), blankInvestigatorInstallment(2)],
    notes: "",
    isCurrent: true,
    createdAt: now,
    updatedAt: now,
  };
};

export const blankRecord = (): EditorialRecord => {
  const now = new Date().toISOString();
  return {
    id: uid(),
    client: "",
    topic: "",
    product: "",
    indexation: "",
    status: "Por asignar",
    operationalStatus: "Normal",
    progress: 0,
    username: "",
    password: "",
    journal: "",
    journalLink: "",
    loginLink: "",
    apcValue: 0,
    hasApc: false,
    journalAccesses: [],
    investigator: "",
    previousInvestigator: "",
    investigatorStartDate: "",
    investigatorEndDate: "",
    startDate: "",
    endDate: "",
    acceptanceDate: "",
    clientTotal: 0,
    outstandingBalance: 0,
    clientPayments: [],
    nextPaymentDate: "",
    nextPaymentAmount: 0,
    investigatorPayment: 0,
    investigatorPaid: 0,
    investigatorHistory: [],
    investigatorInvoiceNumber: "",
    investigatorInvoiceDate: "",
    investigatorInvoiceValue: 0,
    investigatorInvoiceLink: "",
    investigatorInvoiceStatus: "Pendiente",
    contractNumber: "",
    contractStartDate: "",
    contractEndDate: "",
    contractLink: "",
    productionOrder: "",
    clientEmail: "",
    clientId: "",
    clientPhone: "",
    clientAddress: "",
    clientInstitution: "",
    clientCountry: "",
    clientType: "Nuevo",
    contactMedium: "",
    referredBy: "",
    seller: "",
    salesChannel: "",
    saleDate: "",
    salesNotes: "",
    driveFiles: [],
    observations: "",
    sources: ["Registro manual"],
    createdAt: now,
    updatedAt: now,
  };
};

export const paidClientPaymentAmount = (payment: ClientPayment) => {
  const amount = Math.max(0, Number(payment.amount) || 0);
  const paidAmount = Math.max(0, Number(payment.paidAmount) || 0);
  const received = payment.status === "pagado" ? Math.max(paidAmount, amount) : paidAmount;
  return amount > 0 ? Math.min(received, amount) : received;
};

export const normalizeClientPayment = (
  payment: ClientPayment,
  fallbackId = "",
): ClientPayment => {
  const amount = Math.max(0, Number(payment.amount) || 0);
  const rawPaid = Math.max(0, Number(payment.paidAmount) || 0);
  const received = payment.status === "pagado" ? Math.max(rawPaid, amount) : rawPaid;
  const paidAmount = amount > 0 ? Math.min(received, amount) : received;
  const status: ClientPayment["status"] = paidAmount > 0
    ? amount <= 0 || paidAmount >= amount ? "pagado" : "parcial"
    : payment.status === "vencido" ? "vencido" : "pendiente";
  return {
    ...payment,
    id: payment.id || fallbackId || uid(),
    concept: payment.concept || "Pago",
    scheduledDate: payment.scheduledDate || "",
    paidDate: paidAmount > 0 ? payment.paidDate || "" : "",
    amount,
    paidAmount,
    status,
    note: payment.note || "",
  };
};

export const normalizeClientPayments = (record: EditorialRecord): ClientPayment[] => {
  const current = (Array.isArray(record.clientPayments) ? record.clientPayments : [])
    .map((payment, index) => normalizeClientPayment(payment, `${record.id || "payment"}-${index + 1}`));
  if (current.length > 0) return current;

  const total = Math.max(0, Number(record.clientTotal) || 0);
  const storedBalance = Math.max(0, Number(record.outstandingBalance) || 0);
  if (total <= 0 || storedBalance <= 0 || storedBalance >= total) return current;

  const inferredPaid = Math.max(0, total - storedBalance);
  return [{
    id: `${record.id || "legacy"}-pago-inferido-saldo`,
    concept: "Pago histórico inferido del saldo",
    scheduledDate: "",
    paidDate: "",
    amount: inferredPaid,
    paidAmount: inferredPaid,
    status: "pagado",
    note: `Migrado automáticamente: total ${total} menos saldo registrado ${storedBalance}.`,
  }];
};

export const paidByClient = (record: EditorialRecord) =>
  record.clientPayments.reduce((sum, payment) => sum + paidClientPaymentAmount(payment), 0);

export const clientBalance = (record: EditorialRecord) => {
  const paid = paidByClient(record);
  const total = Math.max(0, Number(record.clientTotal) || 0);
  const confirmed = Math.max(0, Number(record.outstandingBalance) || 0);
  if (total > 0) return Math.max(0, total - paid);
  if (record.clientPayments.length > 0) return Math.max(0, confirmed - paid);
  return confirmed;
};

export const clientPaymentState = (record: EditorialRecord) => {
  const total = Math.max(0, Number(record.clientTotal) || 0);
  const paid = paidByClient(record);
  const balance = clientBalance(record);
  if (total > 0 && balance <= 0) return "pagado" as const;
  if (paid > 0) return "parcial" as const;
  return "pendiente" as const;
};

export const daysFromToday = (date: string) => {
  if (!date) return Number.POSITIVE_INFINITY;
  const target = new Date(`${date}T12:00:00`).getTime();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / 86400000);
};

export const paymentRisk = (record: EditorialRecord) => {
  const balance = clientBalance(record);
  if (balance <= 0) return "al-dia";
  const days = daysFromToday(record.nextPaymentDate || record.contractEndDate || record.endDate);
  if (days < -30) return "critico";
  if (days < 0) return "vencido";
  if (days <= 15) return "proximo";
  return "pendiente";
};

export const canonicalKey = (record: Partial<EditorialRecord>) => {
  const contract = normalizeText(record.contractNumber).toUpperCase();
  if (contract && !/^(NO|N\/A|SIN|0|-)$/.test(contract)) return `C:${contract}`;
  return `T:${normalizeText(record.client).toUpperCase()}|${normalizeText(record.topic).toUpperCase()}`;
};
