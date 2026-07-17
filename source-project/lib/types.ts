export type PaymentStatus = "pendiente" | "pagado" | "parcial" | "vencido";
export type OperationalStatus = "Normal" | "Urgente" | "Estancado" | "Espera del cliente";

export interface JournalAccess {
  id: string;
  journal: string;
  journalLink: string;
  loginLink: string;
  username: string;
  password: string;
}

export interface DriveFile {
  id: string;
  name: string;
  category: string;
  url: string;
}

export interface Investigator {
  id: string;
  name: string;
  documentId: string;
  email: string;
  phone: string;
  specialty: string;
  startDate: string;
  endDate: string;
  driveFolderUrl: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type InvestigatorInstallmentStatus = "pendiente" | "parcial" | "pagado";

export interface InvestigatorInstallment {
  number: 1 | 2;
  amount: number;
  paidAmount: number;
  scheduledDate: string;
  paidDate: string;
  status: InvestigatorInstallmentStatus;
}

export interface InvestigatorAssignment {
  id: string;
  investigator: string;
  startDate: string;
  endDate: string;
  agreedPayment: number;
  installments: [InvestigatorInstallment, InvestigatorInstallment];
  notes: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  operationalStatus: OperationalStatus;
  progress: number;
  username: string;
  password: string;
  journal: string;
  journalLink: string;
  loginLink: string;
  apcValue: number;
  hasApc: boolean;
  journalAccesses: JournalAccess[];
  investigator: string;
  previousInvestigator: string;
  investigatorStartDate: string;
  investigatorEndDate: string;
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
  investigatorHistory: InvestigatorAssignment[];
  investigatorInvoiceNumber: string;
  investigatorInvoiceDate: string;
  investigatorInvoiceValue: number;
  investigatorInvoiceLink: string;
  investigatorInvoiceStatus: string;
  contractNumber: string;
  contractStartDate: string;
  contractEndDate: string;
  contractLink: string;
  productionOrder: string;
  clientEmail: string;
  clientId: string;
  clientPhone: string;
  clientAddress: string;
  clientInstitution: string;
  driveFiles: DriveFile[];
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

export interface DeletedRecord {
  id: string;
  deletedAt: string;
}

export interface GoogleSheetsConfig {
  webAppUrl: string;
  syncToken: string;
  autoSync: boolean;
  includeCredentials: boolean;
  remoteRevision: number;
  lastSyncAt: string;
}

export interface AppData {
  version: 2 | 3 | 4 | 5;
  records: EditorialRecord[];
  investigators: Investigator[];
  auditLog: AuditEntry[];
  importedAt: string;
  deletedRecords?: DeletedRecord[];
  googleSheets?: GoogleSheetsConfig;
}

export type ViewKey =
  | "dashboard"
  | "clients"
  | "processes"
  | "portfolio"
  | "investigators"
  | "contracts"
  | "alerts"
  | "google"
  | "data";

export interface Filters {
  search: string;
  status: string;
  investigator: string;
  indexation: string;
  risk: string;
  operationalStatus: string;
  startDate: string;
  endDate: string;
}
