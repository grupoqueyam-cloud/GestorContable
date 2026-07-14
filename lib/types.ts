export type PaymentStatus = "pendiente" | "pagado" | "parcial" | "vencido";

export interface ClientPayment {
  id: string;
  concept: string;
  scheduledDate: string;
  paidDate: string;
  amount: number;
  status: PaymentStatus;
  note: string;
}

export interface EditorialRecord {
  id: string;
  client: string;
  topic: string;
  product: string;
  indexation: string;
  status: string;
  progress: number;
  username: string;
  password: string;
  journal: string;
  journalLink: string;
  loginLink: string;
  apcValue: number;
  investigator: string;
  previousInvestigator: string;
  startDate: string;
  endDate: string;
  acceptanceDate: string;
  clientTotal: number;
  outstandingBalance: number;
  clientPayments: ClientPayment[];
  nextPaymentDate: string;
  nextPaymentAmount: number;
  investigatorPayment: number;
  investigatorPaid: number;
  contractNumber: string;
  productionOrder: string;
  clientEmail: string;
  clientId: string;
  observations: string;
  sources: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  detail: string;
}

export interface AppData {
  version: 2;
  records: EditorialRecord[];
  auditLog: AuditEntry[];
  importedAt: string;
}

export interface EncryptedEnvelope {
  version: 1;
  algorithm: "AES-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  data: string;
  recordCount?: number;
  generatedAt?: string;
}

export type ViewKey =
  | "dashboard"
  | "processes"
  | "portfolio"
  | "investigators"
  | "contracts"
  | "alerts"
  | "data";

export interface Filters {
  search: string;
  status: string;
  investigator: string;
  indexation: string;
  risk: string;
  startDate: string;
  endDate: string;
}
