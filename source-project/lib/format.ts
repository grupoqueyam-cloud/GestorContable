import type { ClientPayment, EditorialRecord } from "./types";

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
  if (/ACEPTAD/.test(text)) return 90;
  if (/TERMINAD|ENTREGAD/.test(text)) return 82;
  if (/CORRECCION|PARES|REVISION/.test(text)) return 68;
  if (/ENVIAD|SUBID|REVISTA/.test(text)) return 55;
  if (/ELABOR|DESARROLL|PROCESO/.test(text)) return 38;
  if (/RECHAZAD/.test(text)) return 25;
  if (/PAUSAD|PENDIENTE|ESPERA/.test(text)) return 15;
  return text ? 30 : 0;
};

export const blankPayment = (concept = "Próximo pago"): ClientPayment => ({
  id: uid(),
  concept,
  scheduledDate: "",
  paidDate: "",
  amount: 0,
  status: "pendiente",
  note: "",
});

export const blankRecord = (): EditorialRecord => {
  const now = new Date().toISOString();
  return {
    id: uid(),
    client: "",
    topic: "",
    product: "",
    indexation: "",
    status: "Pendiente",
    progress: 0,
    username: "",
    password: "",
    journal: "",
    journalLink: "",
    loginLink: "",
    apcValue: 0,
    investigator: "",
    previousInvestigator: "",
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
    contractNumber: "",
    productionOrder: "",
    clientEmail: "",
    clientId: "",
    observations: "",
    sources: ["Registro manual"],
    createdAt: now,
    updatedAt: now,
  };
};

export const paidByClient = (record: EditorialRecord) =>
  record.clientPayments
    .filter((payment) => payment.status === "pagado")
    .reduce((sum, payment) => sum + payment.amount, 0);

export const clientBalance = (record: EditorialRecord) =>
  paidByClient(record) > 0 && record.clientTotal > 0
    ? Math.max(0, record.clientTotal - paidByClient(record))
    : Number(record.outstandingBalance) > 0
      ? Number(record.outstandingBalance)
      : Math.max(0, record.clientTotal - paidByClient(record));

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
  const days = daysFromToday(record.nextPaymentDate || record.endDate);
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
