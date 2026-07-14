"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ChevronDown,
  Cloud,
  CloudDownload,
  CloudUpload,
  CircleDollarSign,
  ClipboardList,
  Columns3,
  FileText,
  Database,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Filter,
  KeyRound,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  exportWorkbook,
  importExcelFiles,
} from "../lib/excel";
import {
  blankPayment,
  blankRecord,
  clientBalance,
  daysFromToday,
  formatCurrency,
  formatDate,
  normalizeText,
  paidByClient,
  paymentRisk,
  uid,
} from "../lib/format";
import {
  emptyGoogleSheetsConfig,
  isValidWebAppUrl,
  normalizeAppData,
  pullGoogleSheets,
  syncGoogleSheets,
  testGoogleSheetsConnection,
} from "../lib/google-sheets";
import type {
  AppData,
  AuditEntry,
  ClientPayment,
  EditorialRecord,
  Filters,
  GoogleSheetsConfig,
  ViewKey,
} from "../lib/types";

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "",
  investigator: "",
  indexation: "",
  risk: "",
  startDate: "",
  endDate: "",
};

const PIE_COLORS = ["#2f8f7f", "#e3aa3d", "#d66d5d", "#5d7fa3", "#81907d", "#725ea8"];

const NAV_ITEMS: { key: ViewKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Resumen ejecutivo", icon: LayoutDashboard },
  { key: "processes", label: "Procesos editoriales", icon: ClipboardList },
  { key: "portfolio", label: "Recuperación de cartera", icon: WalletCards },
  { key: "investigators", label: "Investigadores", icon: UsersRound },
  { key: "contracts", label: "Contratos", icon: FileText },
  { key: "alerts", label: "Alertas y vencimientos", icon: Bell },
  { key: "google", label: "Google Sheets", icon: Cloud },
  { key: "data", label: "Importar y exportar", icon: Database },
];

type ColumnKey =
  | "id"
  | "client"
  | "topic"
  | "payments"
  | "nextPayment"
  | "indexation"
  | "status"
  | "credentials"
  | "journal"
  | "link"
  | "apc"
  | "investigator"
  | "dates"
  | "investigatorPayment"
  | "contract"
  | "progress"
  | "clientPayments";

const COLUMN_LABELS: Record<ColumnKey, string> = {
  id: "ID",
  client: "Cliente",
  topic: "Tema",
  payments: "Pagos",
  nextPayment: "Próximo pago",
  indexation: "Indexación",
  status: "Estado",
  credentials: "Usuarios / contraseñas",
  journal: "Revista",
  link: "Link",
  apc: "Valor APC",
  investigator: "Investigador a cargo",
  dates: "Inicio / fin",
  investigatorPayment: "Pago investigador",
  contract: "N.º de contrato",
  progress: "Avance",
  clientPayments: "Pagos cliente",
};

const DEFAULT_COLUMNS: ColumnKey[] = [
  "client",
  "topic",
  "payments",
  "nextPayment",
  "indexation",
  "status",
  "journal",
  "investigator",
  "contract",
  "progress",
];

const statusBucket = (status: string) => {
  const value = normalizeText(status).toUpperCase();
  if (/PUBLICAD|FINALIZAD|CERRAD/.test(value)) return "Finalizado";
  if (/ACEPTAD/.test(value)) return "Aceptado";
  if (/CORRECCION|PARES|REVISION/.test(value)) return "En revisión";
  if (/ENVIAD|SUBID|REVISTA/.test(value)) return "En revista";
  if (/RECHAZAD/.test(value)) return "Rechazado";
  if (/PAUSAD|PENDIENTE|ESPERA/.test(value)) return "Pendiente";
  return "En desarrollo";
};

const statusClass = (status: string) => {
  const bucket = statusBucket(status);
  if (["Finalizado", "Aceptado"].includes(bucket)) return "success";
  if (["Rechazado"].includes(bucket)) return "danger";
  if (["Pendiente"].includes(bucket)) return "warning";
  return "info";
};

const addAudit = (data: AppData, action: string, detail: string): AppData => ({
  ...data,
  auditLog: [
    { id: uid(), timestamp: new Date().toISOString(), action, detail },
    ...data.auditLog,
  ].slice(0, 300),
});

function CloudAuthScreen({ onReady }: { onReady: (data: AppData) => void }) {
  const [webAppUrl, setWebAppUrl] = useState("");
  const [syncToken, setSyncToken] = useState("");
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("./cloud-config.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : {})
      .then((config: { webAppUrl?: string }) => {
        if (active && config.webAppUrl) setWebAppUrl(config.webAppUrl);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!isValidWebAppUrl(webAppUrl)) {
      setError("La URL debe ser la implementación de Apps Script terminada en /exec.");
      return;
    }
    if (!syncToken.trim()) {
      setError("Ingresa la clave SYNC_SECRET de Apps Script.");
      return;
    }
    setBusy(true);
    try {
      const config: GoogleSheetsConfig = {
        ...emptyGoogleSheetsConfig(),
        webAppUrl: webAppUrl.trim(),
        syncToken: syncToken.trim(),
        autoSync: true,
        includeCredentials,
      };
      const snapshot = await pullGoogleSheets(config);
      onReady(normalizeAppData({
        version: 3,
        records: snapshot.records,
        auditLog: snapshot.auditLog,
        deletedRecords: snapshot.deletedRecords,
        importedAt: snapshot.serverTime,
        googleSheets: {
          ...config,
          remoteRevision: snapshot.revision,
          lastSyncAt: snapshot.serverTime,
        },
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo abrir la base de Google Sheets.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand-mark large"><Cloud size={27} /></div>
        <span className="eyebrow">SUSTAINABILITY · CONTROL EDITORIAL</span>
        <h1>Toda la operación centralizada en Google Sheets.</h1>
        <p>GitHub Pages sirve únicamente la interfaz. Clientes, contratos, cartera, pagos, investigadores e historial se consultan y guardan directamente en la hoja.</p>
        <div className="auth-points">
          <span><Cloud /> Base 100 % remota</span>
          <span><FileSpreadsheet /> Importación de Excel</span>
          <span><BarChart3 /> Indicadores en tiempo real</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">CONEXIÓN A LA BASE CENTRAL</span>
          <h2>Abrir Google Sheets</h2>
          <p>La clave se utiliza solo durante esta sesión y no se guarda en el navegador ni en GitHub.</p>
          <form onSubmit={submit} className="auth-form">
            <label>URL de Apps Script<span className="input-icon"><Link2 size={17} /><input type="url" placeholder="https://script.google.com/macros/s/.../exec" value={webAppUrl} onChange={(event) => setWebAppUrl(event.target.value)} autoFocus /></span></label>
            <label>Clave de sincronización<span className="input-icon"><KeyRound size={17} /><input type="password" autoComplete="off" placeholder="SYNC_SECRET" value={syncToken} onChange={(event) => setSyncToken(event.target.value)} /></span></label>
            <label className="check-row cloud-check"><input type="checkbox" checked={includeCredentials} onChange={(event) => setIncludeCredentials(event.target.checked)} /><span><strong>Cargar usuarios y contraseñas de revistas</strong><small>Actívelo únicamente si la hoja es privada.</small></span></label>
            {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}
            <button className="button primary wide" disabled={busy}>{busy ? <RefreshCw className="spin" size={17} /> : <CloudDownload size={17} />}{busy ? "Conectando…" : "Conectar y abrir sistema"}</button>
          </form>
          <div className="cloud-only-note"><ShieldCheck size={17} /><span><strong>Sin almacenamiento local</strong><small>Al cerrar o recargar la página, la sesión y la clave desaparecen.</small></span></div>
        </div>
      </section>
    </main>
  );
}

function ProgressBar({ value, compact = false }: { value: number; compact?: boolean }) {
  const safe = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className={`progress-wrap ${compact ? "compact" : ""}`}>
      <div className="progress-track"><span style={{ width: `${safe}%` }} /></div>
      <strong>{safe}%</strong>
    </div>
  );
}

function KpiCard({ label, value, note, icon, tone }: { label: string; value: string; note: string; icon: ReactNode; tone: string }) {
  return (
    <article className="kpi-card">
      <div className={`kpi-icon ${tone}`}>{icon}</div>
      <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </article>
  );
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><BookOpen /></div>
      <h3>{title}</h3><p>{text}</p>{action}
    </div>
  );
}

function RecordModal({
  source,
  onClose,
  onSave,
  onDelete,
}: {
  source: EditorialRecord;
  onClose: () => void;
  onSave: (record: EditorialRecord) => void;
  onDelete?: (record: EditorialRecord) => void;
}) {
  const [draft, setDraft] = useState<EditorialRecord>(() => structuredClone(source));
  const [tab, setTab] = useState<"general" | "editorial" | "finances" | "access">("general");
  const [showSecret, setShowSecret] = useState(false);
  const set = <K extends keyof EditorialRecord>(key: K, value: EditorialRecord[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const updatePayment = (id: string, patch: Partial<ClientPayment>) =>
    setDraft((current) => ({ ...current, clientPayments: current.clientPayments.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const removePayment = (id: string) =>
    setDraft((current) => ({ ...current, clientPayments: current.clientPayments.filter((item) => item.id !== id) }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.client.trim()) return;
    onSave({ ...draft, progress: Math.min(100, Math.max(0, Number(draft.progress))), updatedAt: new Date().toISOString() });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal-card record-modal" onSubmit={submit}>
        <header className="modal-header">
          <div><span className="eyebrow">FICHA EDITORIAL</span><h2>{draft.client || "Nuevo proceso"}</h2><p>{draft.contractNumber || "Sin número de contrato"}</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X /></button>
        </header>
        <div className="modal-tabs">
          {(["general", "editorial", "finances", "access"] as const).map((key) => (
            <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              {key === "general" ? "General" : key === "editorial" ? "Editorial" : key === "finances" ? "Finanzas" : "Accesos"}
            </button>
          ))}
        </div>
        <div className="modal-body">
          {tab === "general" && (
            <div className="form-grid">
              <label className="span-2">Cliente *<input value={draft.client} onChange={(event) => set("client", event.target.value)} required /></label>
              <label className="span-2">Tema / título<textarea value={draft.topic} onChange={(event) => set("topic", event.target.value)} rows={3} /></label>
              <label>Producto<input value={draft.product} onChange={(event) => set("product", event.target.value)} /></label>
              <label>N.º de contrato<input value={draft.contractNumber} onChange={(event) => set("contractNumber", event.target.value)} /></label>
              <label>Orden de producción<input value={draft.productionOrder} onChange={(event) => set("productionOrder", event.target.value)} /></label>
              <label>Investigador a cargo<input value={draft.investigator} onChange={(event) => set("investigator", event.target.value)} /></label>
              <label>Investigador anterior<input value={draft.previousInvestigator} onChange={(event) => set("previousInvestigator", event.target.value)} /></label>
              <label>Fecha de inicio<input type="date" value={draft.startDate} onChange={(event) => set("startDate", event.target.value)} /></label>
              <label>Fecha de fin<input type="date" value={draft.endDate} onChange={(event) => set("endDate", event.target.value)} /></label>
              <label>Estado<input value={draft.status} onChange={(event) => set("status", event.target.value)} /></label>
              <label>Porcentaje de avance<div className="range-field"><input type="range" min="0" max="100" value={draft.progress} onChange={(event) => set("progress", Number(event.target.value))} /><strong>{draft.progress}%</strong></div></label>
              <label>Correo del cliente<input type="email" value={draft.clientEmail} onChange={(event) => set("clientEmail", event.target.value)} /></label>
              <label>Cédula / identificación<input value={draft.clientId} onChange={(event) => set("clientId", event.target.value)} /></label>
              <label className="span-2">Observaciones<textarea value={draft.observations} onChange={(event) => set("observations", event.target.value)} rows={4} /></label>
            </div>
          )}
          {tab === "editorial" && (
            <div className="form-grid">
              <label>Indexación<input value={draft.indexation} onChange={(event) => set("indexation", event.target.value)} placeholder="Scopus Q2, SciELO, Latindex…" /></label>
              <label>Revista<input value={draft.journal} onChange={(event) => set("journal", event.target.value)} /></label>
              <label className="span-2">Link de revista<input type="url" value={draft.journalLink} onChange={(event) => set("journalLink", event.target.value)} /></label>
              <label className="span-2">Link de inicio de sesión<input type="url" value={draft.loginLink} onChange={(event) => set("loginLink", event.target.value)} /></label>
              <label>Fecha de aceptación<input type="date" value={draft.acceptanceDate} onChange={(event) => set("acceptanceDate", event.target.value)} /></label>
              <label>Valor APC (USD)<input type="number" min="0" step="0.01" value={draft.apcValue} onChange={(event) => set("apcValue", Number(event.target.value))} /></label>
              <div className="source-box span-2"><strong>Procedencia del registro</strong>{draft.sources.map((sourceItem) => <span key={sourceItem}>{sourceItem}</span>)}</div>
            </div>
          )}
          {tab === "finances" && (
            <div className="finance-form">
              <div className="form-grid">
                <label>Total contratado al cliente (USD)<input type="number" min="0" step="0.01" value={draft.clientTotal} onChange={(event) => set("clientTotal", Number(event.target.value))} /></label>
                <label>Saldo pendiente confirmado (USD)<input type="number" min="0" step="0.01" value={draft.outstandingBalance || 0} onChange={(event) => set("outstandingBalance", Number(event.target.value))} /><small className="field-help">Úsalo cuando el Excel indique el saldo pero no el monto de cada abono.</small></label>
                <label>Próximo pago esperado (USD)<input type="number" min="0" step="0.01" value={draft.nextPaymentAmount} onChange={(event) => set("nextPaymentAmount", Number(event.target.value))} /></label>
                <label>Fecha del próximo pago<input type="date" value={draft.nextPaymentDate} onChange={(event) => set("nextPaymentDate", event.target.value)} /></label>
                <label>Honorario del investigador (USD)<input type="number" min="0" step="0.01" value={draft.investigatorPayment} onChange={(event) => set("investigatorPayment", Number(event.target.value))} /></label>
                <label>Pagado al investigador (USD)<input type="number" min="0" step="0.01" value={draft.investigatorPaid} onChange={(event) => set("investigatorPaid", Number(event.target.value))} /></label>
                <div className="mini-balance"><span>Saldo calculado</span><strong>{formatCurrency(clientBalance(draft))}</strong></div>
              </div>
              <div className="section-heading"><div><h3>Pagos del cliente</h3><p>Cronograma e historial de abonos.</p></div><button type="button" className="button secondary small" onClick={() => setDraft((current) => ({ ...current, clientPayments: [...current.clientPayments, blankPayment()] }))}><Plus size={15} /> Añadir pago</button></div>
              <div className="payment-editor">
                {draft.clientPayments.length === 0 && <p className="muted center">No existen pagos registrados.</p>}
                {draft.clientPayments.map((payment) => (
                  <div className="payment-row" key={payment.id}>
                    <input aria-label="Concepto" value={payment.concept} onChange={(event) => updatePayment(payment.id, { concept: event.target.value })} />
                    <input aria-label="Monto" type="number" min="0" step="0.01" value={payment.amount} onChange={(event) => updatePayment(payment.id, { amount: Number(event.target.value) })} />
                    <input aria-label="Fecha prevista" type="date" value={payment.scheduledDate} onChange={(event) => updatePayment(payment.id, { scheduledDate: event.target.value })} />
                    <select aria-label="Estado" value={payment.status} onChange={(event) => updatePayment(payment.id, { status: event.target.value as ClientPayment["status"], paidDate: event.target.value === "pagado" ? payment.paidDate || new Date().toISOString().slice(0, 10) : payment.paidDate })}>
                      <option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagado">Pagado</option><option value="vencido">Vencido</option>
                    </select>
                    <button type="button" className="icon-button danger" onClick={() => removePayment(payment.id)}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "access" && (
            <div className="form-grid">
              <div className="privacy-note span-2"><ShieldCheck /><div><strong>Datos sensibles en Google Sheets</strong><p>Estos campos se guardan en la hoja central y aparecen ocultos en la interfaz. Restrinja el acceso a la hoja.</p></div></div>
              <label>Usuario<input value={draft.username} onChange={(event) => set("username", event.target.value)} autoComplete="off" /></label>
              <label>Contraseña<div className="password-field"><input type={showSecret ? "text" : "password"} value={draft.password} onChange={(event) => set("password", event.target.value)} autoComplete="new-password" /><button type="button" onClick={() => setShowSecret((value) => !value)}>{showSecret ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            </div>
          )}
        </div>
        <footer className="modal-footer">
          {onDelete ? <button type="button" className="button danger ghost" onClick={() => onDelete(draft)}><Trash2 size={16} /> Eliminar</button> : <span />}
          <div><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary"><Save size={16} /> Guardar cambios</button></div>
        </footer>
      </form>
    </div>
  );
}

function FiltersBar({ filters, setFilters, records }: { filters: Filters; setFilters: (filters: Filters) => void; records: EditorialRecord[] }) {
  const [open, setOpen] = useState(false);
  const statuses = useMemo(() => Array.from(new Set(records.map((record) => statusBucket(record.status)))).sort(), [records]);
  const investigators = useMemo(() => Array.from(new Set(records.map((record) => record.investigator).filter(Boolean))).sort(), [records]);
  const indexations = useMemo(() => Array.from(new Set(records.map((record) => record.indexation).filter(Boolean))).sort(), [records]);
  const active = Object.entries(filters).filter(([key, value]) => key !== "search" && value).length;
  return (
    <>
      <div className="filter-row">
        <div className="table-search"><Search size={17} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Buscar cliente, contrato, tema o revista…" />{filters.search && <button onClick={() => setFilters({ ...filters, search: "" })}><X size={15} /></button>}</div>
        <button className={`button secondary ${active ? "active-filter" : ""}`} onClick={() => setOpen((value) => !value)}><Filter size={16} /> Filtros {active > 0 && <span>{active}</span>}<ChevronDown size={14} /></button>
      </div>
      {open && (
        <div className="advanced-filters">
          <label>Estado<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Investigador<select value={filters.investigator} onChange={(event) => setFilters({ ...filters, investigator: event.target.value })}><option value="">Todos</option>{investigators.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Indexación<select value={filters.indexation} onChange={(event) => setFilters({ ...filters, indexation: event.target.value })}><option value="">Todas</option>{indexations.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Riesgo de cartera<select value={filters.risk} onChange={(event) => setFilters({ ...filters, risk: event.target.value })}><option value="">Todos</option><option value="critico">Crítico (+30 días)</option><option value="vencido">Vencido</option><option value="proximo">Próximo</option><option value="al-dia">Al día</option></select></label>
          <label>Inicio desde<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} /></label>
          <label>Fin hasta<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} /></label>
          <button className="text-button" onClick={() => setFilters(EMPTY_FILTERS)}>Limpiar filtros</button>
        </div>
      )}
    </>
  );
}

function ProcessesTable({ records, onEdit }: { records: EditorialRecord[]; onEdit: (record: EditorialRecord) => void }) {
  const [visible, setVisible] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [picker, setPicker] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(page, pages);
  const current = records.slice((safePage - 1) * pageSize, safePage * pageSize);
  const show = (key: ColumnKey) => visible.includes(key);
  const toggle = (key: ColumnKey) => setVisible((currentKeys) => currentKeys.includes(key) ? currentKeys.filter((item) => item !== key) : [...currentKeys, key]);
  return (
    <div className="table-card">
      <div className="table-meta"><span><strong>{records.length}</strong> procesos encontrados</span><div className="column-picker-wrap"><button className="button secondary small" onClick={() => setPicker((value) => !value)}><Columns3 size={15} /> Columnas</button>{picker && <div className="column-picker">{(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((key) => <label key={key}><input type="checkbox" checked={show(key)} onChange={() => toggle(key)} />{COLUMN_LABELS[key]}</label>)}</div>}</div></div>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr>{(Object.keys(COLUMN_LABELS) as ColumnKey[]).filter(show).map((key) => <th key={key}>{COLUMN_LABELS[key]}</th>)}<th aria-label="Acciones" /></tr></thead>
          <tbody>
            {current.map((record) => (
              <tr key={record.id} onDoubleClick={() => onEdit(record)}>
                {show("id") && <td className="mono">{record.id.slice(0, 8)}</td>}
                {show("client") && <td className="sticky-cell"><button className="client-link" onClick={() => onEdit(record)}>{record.client}<small>{record.contractNumber || "Sin contrato"}</small></button></td>}
                {show("topic") && <td><span className="truncate-2" title={record.topic}>{record.topic || record.product || "—"}</span></td>}
                {show("payments") && <td><strong>{formatCurrency(paidByClient(record))}</strong><small className="cell-note">de {formatCurrency(record.clientTotal)}</small></td>}
                {show("nextPayment") && <td><strong className={daysFromToday(record.nextPaymentDate) < 0 ? "text-danger" : ""}>{formatCurrency(record.nextPaymentAmount || clientBalance(record))}</strong><small className="cell-note">{formatDate(record.nextPaymentDate)}</small></td>}
                {show("indexation") && <td><span className="soft-tag">{record.indexation || "Sin definir"}</span></td>}
                {show("status") && <td><span className={`status-pill ${statusClass(record.status)}`}>{record.status || "Pendiente"}</span></td>}
                {show("credentials") && <td><span className="secret-cell">{record.username || "—"}<small>{record.password ? "••••••••" : "Sin contraseña"}</small></span></td>}
                {show("journal") && <td>{record.journal || "—"}</td>}
                {show("link") && <td>{record.journalLink ? <a className="link-button" href={record.journalLink} target="_blank" rel="noreferrer"><Link2 size={15} /> Abrir</a> : "—"}</td>}
                {show("apc") && <td>{formatCurrency(record.apcValue)}</td>}
                {show("investigator") && <td><span className="person-cell"><UserRound size={15} />{record.investigator || "Sin asignar"}</span></td>}
                {show("dates") && <td><span>{formatDate(record.startDate)}</span><small className="cell-note">hasta {formatDate(record.endDate)}</small></td>}
                {show("investigatorPayment") && <td><span>{formatCurrency(record.investigatorPaid)}</span><small className="cell-note">de {formatCurrency(record.investigatorPayment)}</small></td>}
                {show("contract") && <td className="mono">{record.contractNumber || "—"}</td>}
                {show("progress") && <td className="progress-cell"><ProgressBar value={record.progress} compact /></td>}
                {show("clientPayments") && <td>{record.clientPayments.length} registro(s)</td>}
                <td><button className="icon-button" onClick={() => onEdit(record)} aria-label={`Editar ${record.client}`}><Pencil size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 && <EmptyState title="No hay procesos para mostrar" text="Cambia los filtros o importa una base de Excel." />}
      </div>
      {records.length > pageSize && <div className="pagination"><button disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><span>Página {safePage} de {pages}</span><button disabled={safePage >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Siguiente</button></div>}
    </div>
  );
}

function Dashboard({ records, onEdit, onNavigate }: { records: EditorialRecord[]; onEdit: (record: EditorialRecord) => void; onNavigate: (view: ViewKey) => void }) {
  const metrics = useMemo(() => {
    const contracted = records.reduce((sum, record) => sum + record.clientTotal, 0);
    const paid = records.reduce((sum, record) => sum + paidByClient(record), 0);
    const balance = records.reduce((sum, record) => sum + clientBalance(record), 0);
    const overdue = records.filter((record) => ["critico", "vencido"].includes(paymentRisk(record)) && clientBalance(record) > 0);
    const active = records.filter((record) => record.progress < 100);
    const dueSoon = records.filter((record) => { const days = daysFromToday(record.nextPaymentDate || record.endDate); return days >= 0 && days <= 30; });
    return { contracted, paid, balance, overdue, active, dueSoon };
  }, [records]);
  const statusData = useMemo(() => {
    const grouped = new Map<string, number>();
    records.forEach((record) => grouped.set(statusBucket(record.status), (grouped.get(statusBucket(record.status)) || 0) + 1));
    return Array.from(grouped, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [records]);
  const investigatorData = useMemo(() => {
    const grouped = new Map<string, number>();
    records.forEach((record) => grouped.set(record.investigator || "Sin asignar", (grouped.get(record.investigator || "Sin asignar") || 0) + clientBalance(record)));
    return Array.from(grouped, ([name, value]) => ({ name: name.split(" ")[0], fullName: name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [records]);
  const recentRisk = [...metrics.overdue].sort((a, b) => daysFromToday(a.nextPaymentDate || a.endDate) - daysFromToday(b.nextPaymentDate || b.endDate)).slice(0, 5);
  return (
    <div className="view-stack">
      <section className="kpi-grid">
        <KpiCard label="Valor contratado" value={formatCurrency(metrics.contracted)} note={`${records.length} procesos consolidados`} icon={<CircleDollarSign />} tone="mint" />
        <KpiCard label="Cartera pendiente" value={formatCurrency(metrics.balance)} note={`${metrics.overdue.length} cuentas vencidas`} icon={<WalletCards />} tone="amber" />
        <KpiCard label="Recaudación registrada" value={formatCurrency(metrics.paid)} note={metrics.contracted ? `${Math.round(metrics.paid / metrics.contracted * 100)}% del valor contratado` : "Sin valor contratado"} icon={<Check />} tone="blue" />
        <KpiCard label="Procesos activos" value={String(metrics.active.length)} note={`${metrics.dueSoon.length} hitos en próximos 30 días`} icon={<BriefcaseBusiness />} tone="coral" />
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-heading"><div><span className="eyebrow">OPERACIÓN</span><h3>Distribución por estado</h3></div><button className="text-button" onClick={() => onNavigate("processes")}>Ver procesos</button></div>
          {records.length ? <div className="chart-layout"><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}>{statusData.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => [`${value} procesos`, "Cantidad"]} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{records.length}</strong><span>procesos</span></div></div><div className="chart-legend">{statusData.map((item, index) => <div key={item.name}><i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} /><span>{item.name}</span><strong>{item.value}</strong></div>)}</div></div> : <EmptyState title="Sin datos" text="Importa los Excel para visualizar los estados." />}
        </article>
        <article className="panel chart-panel">
          <div className="panel-heading"><div><span className="eyebrow">CARTERA</span><h3>Saldo por investigador</h3></div><button className="text-button" onClick={() => onNavigate("investigators")}>Ver equipo</button></div>
          {investigatorData.length ? <div className="bar-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={investigatorData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e7e4dc" /><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} /><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} tickLine={false} axisLine={false} fontSize={11} width={42} /><Tooltip formatter={(value) => [formatCurrency(Number(value)), "Saldo"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ""} /><Bar dataKey="value" fill="#2f8f7f" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="Sin saldos" text="Añade valores de contrato y pagos para ver la cartera." />}
        </article>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">PRIORIDAD DE COBRO</span><h3>Cartera que requiere acción</h3></div><button className="button secondary small" onClick={() => onNavigate("portfolio")}>Gestionar cartera</button></div>
        {recentRisk.length ? <div className="priority-list">{recentRisk.map((record) => <button key={record.id} onClick={() => onEdit(record)}><span className={`risk-dot ${paymentRisk(record)}`} /><div><strong>{record.client}</strong><small>{record.contractNumber || record.topic || "Sin referencia"}</small></div><span className="priority-investigator">{record.investigator || "Sin asignar"}</span><div className="priority-amount"><strong>{formatCurrency(clientBalance(record))}</strong><small>{Math.abs(daysFromToday(record.nextPaymentDate || record.endDate))} días vencido</small></div><MoreHorizontal /></button>)}</div> : <EmptyState title="Cartera al día" text="No hay saldos vencidos con la información disponible." />}
      </section>
    </div>
  );
}

function PortfolioView({ records, onEdit }: { records: EditorialRecord[]; onEdit: (record: EditorialRecord) => void }) {
  const items = useMemo(() => records.filter((record) => clientBalance(record) > 0).sort((a, b) => daysFromToday(a.nextPaymentDate || a.endDate) - daysFromToday(b.nextPaymentDate || b.endDate)), [records]);
  const aging = useMemo(() => {
    const buckets = [
      { name: "Por vencer", value: 0, color: "#5d7fa3" },
      { name: "1–30 días", value: 0, color: "#e3aa3d" },
      { name: "31–60 días", value: 0, color: "#d98a52" },
      { name: "61–90 días", value: 0, color: "#d66d5d" },
      { name: "+90 días", value: 0, color: "#9e4250" },
    ];
    items.forEach((record) => {
      const overdueDays = -daysFromToday(record.nextPaymentDate || record.endDate);
      const bucket = overdueDays <= 0 ? 0 : overdueDays <= 30 ? 1 : overdueDays <= 60 ? 2 : overdueDays <= 90 ? 3 : 4;
      buckets[bucket].value += clientBalance(record);
    });
    return buckets;
  }, [items]);
  return (
    <div className="view-stack">
      <div className="portfolio-summary">
        <article><span>Saldo total</span><strong>{formatCurrency(items.reduce((sum, record) => sum + clientBalance(record), 0))}</strong><small>{items.length} cuentas por cobrar</small></article>
        {aging.slice(1).map((bucket) => <article key={bucket.name}><span>{bucket.name}</span><strong>{formatCurrency(bucket.value)}</strong><small>cartera vencida</small></article>)}
      </div>
      <section className="panel chart-panel aging-panel"><div className="panel-heading"><div><span className="eyebrow">ANTIGÜEDAD</span><h3>Composición de la cartera</h3></div></div><div className="aging-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={aging} layout="vertical" margin={{ left: 10, right: 30 }}><CartesianGrid horizontal={false} stroke="#ece8df" /><XAxis type="number" tickFormatter={(value) => `$${Math.round(value / 1000)}k`} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={84} axisLine={false} tickLine={false} fontSize={11} /><Tooltip formatter={(value) => [formatCurrency(Number(value)), "Saldo"]} /><Bar dataKey="value" radius={[0, 7, 7, 0]}>{aging.map((item) => <Cell key={item.name} fill={item.color} />)}</Bar></BarChart></ResponsiveContainer></div></section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">GESTIÓN</span><h3>Detalle de cuentas por cobrar</h3></div></div>{items.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Cliente</th><th>Contrato</th><th>Investigador</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Próximo pago</th><th>Riesgo</th><th /></tr></thead><tbody>{items.map((record) => { const risk = paymentRisk(record); const days = daysFromToday(record.nextPaymentDate || record.endDate); return <tr key={record.id}><td><button className="client-link" onClick={() => onEdit(record)}>{record.client}<small>{record.topic || "Sin tema"}</small></button></td><td className="mono">{record.contractNumber || "—"}</td><td>{record.investigator || "Sin asignar"}</td><td>{formatCurrency(record.clientTotal)}</td><td>{formatCurrency(paidByClient(record))}</td><td><strong>{formatCurrency(clientBalance(record))}</strong></td><td>{formatDate(record.nextPaymentDate || record.endDate)}</td><td><span className={`risk-pill ${risk}`}>{risk === "critico" ? `Crítico · ${Math.abs(days)} d` : risk === "vencido" ? `Vencido · ${Math.abs(days)} d` : risk === "proximo" ? `En ${days} d` : risk === "al-dia" ? "Al día" : "Pendiente"}</span></td><td><button className="button secondary small" onClick={() => onEdit(record)}>Gestionar</button></td></tr>; })}</tbody></table></div> : <EmptyState title="No hay cartera pendiente" text="Los contratos con saldo aparecerán aquí." />}</section>
    </div>
  );
}

function InvestigatorsView({ records }: { records: EditorialRecord[] }) {
  const team = useMemo(() => {
    const map = new Map<string, EditorialRecord[]>();
    records.forEach((record) => { const name = record.investigator || "Sin asignar"; map.set(name, [...(map.get(name) || []), record]); });
    return Array.from(map, ([name, own]) => ({
      name,
      count: own.length,
      active: own.filter((item) => item.progress < 100).length,
      avg: Math.round(own.reduce((sum, item) => sum + item.progress, 0) / own.length),
      portfolio: own.reduce((sum, item) => sum + clientBalance(item), 0),
      fee: own.reduce((sum, item) => sum + item.investigatorPayment, 0),
      paid: own.reduce((sum, item) => sum + item.investigatorPaid, 0),
    })).sort((a, b) => b.count - a.count);
  }, [records]);
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">EQUIPO DE INVESTIGACIÓN</span><h3>Carga, avance y honorarios</h3></div><span className="count-chip">{team.length} investigadores</span></div>{team.length ? <div className="team-grid">{team.map((person) => <article className="team-card" key={person.name}><div className="avatar">{person.name.split(" ").slice(0, 2).map((word) => word[0]).join("")}</div><div className="team-main"><h4>{person.name}</h4><p>{person.active} activos · {person.count} asignados</p></div><ProgressBar value={person.avg} /><div className="team-stats"><div><span>Cartera asociada</span><strong>{formatCurrency(person.portfolio)}</strong></div><div><span>Honorario</span><strong>{formatCurrency(person.fee)}</strong></div><div><span>Pendiente por pagar</span><strong>{formatCurrency(Math.max(0, person.fee - person.paid))}</strong></div></div></article>)}</div> : <EmptyState title="Sin investigadores" text="Asigna responsables a los procesos para ver su carga." />}</section>;
}

function ContractsView({ records, onEdit }: { records: EditorialRecord[]; onEdit: (record: EditorialRecord) => void }) {
  const contracts = records.filter((record) => record.contractNumber);
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">CONTRATOS</span><h3>Registro contractual consolidado</h3></div><span className="count-chip">{contracts.length} con número</span></div>{contracts.length ? <div className="contract-grid">{contracts.map((record) => <button key={record.id} className="contract-card" onClick={() => onEdit(record)}><div className="contract-icon"><FileText /></div><div><span className="mono">{record.contractNumber}</span><h4>{record.client}</h4><p>{record.topic || record.product || "Sin detalle del producto"}</p></div><div className="contract-side"><span className={`status-pill ${statusClass(record.status)}`}>{statusBucket(record.status)}</span><strong>{formatCurrency(record.clientTotal)}</strong><ProgressBar value={record.progress} compact /></div></button>)}</div> : <EmptyState title="No hay contratos registrados" text="Los procesos sin número permanecen disponibles en Procesos editoriales." />}</section>;
}

function AlertsView({ records, onEdit }: { records: EditorialRecord[]; onEdit: (record: EditorialRecord) => void }) {
  const alerts = useMemo(() => records.flatMap((record) => {
    const items: { id: string; record: EditorialRecord; kind: string; date: string; days: number; tone: string; detail: string }[] = [];
    if (record.nextPaymentDate && clientBalance(record) > 0) {
      const days = daysFromToday(record.nextPaymentDate);
      if (days <= 30) items.push({ id: `${record.id}-payment`, record, kind: days < 0 ? "Pago vencido" : "Próximo pago", date: record.nextPaymentDate, days, tone: days < 0 ? "danger" : "warning", detail: formatCurrency(record.nextPaymentAmount || clientBalance(record)) });
    }
    if (record.endDate && record.progress < 100) {
      const days = daysFromToday(record.endDate);
      if (days <= 30) items.push({ id: `${record.id}-end`, record, kind: days < 0 ? "Plazo contractual vencido" : "Fin de contrato", date: record.endDate, days, tone: days < 0 ? "danger" : "info", detail: `${record.progress}% de avance` });
    }
    return items;
  }).sort((a, b) => a.days - b.days), [records]);
  return <div className="view-stack"><section className="alert-hero"><div><span className="eyebrow">AGENDA DE ACCIÓN</span><h3>{alerts.filter((item) => item.days < 0).length} vencimientos requieren atención</h3><p>Pagos e hitos contractuales calculados con las fechas disponibles.</p></div><CalendarClock /></section><section className="panel">{alerts.length ? <div className="alerts-list">{alerts.map((alert) => <button key={alert.id} onClick={() => onEdit(alert.record)}><div className={`alert-icon ${alert.tone}`}>{alert.tone === "danger" ? <AlertCircle /> : <CalendarClock />}</div><div><span className="eyebrow">{alert.kind}</span><h4>{alert.record.client}</h4><p>{alert.record.contractNumber || alert.record.topic || "Sin referencia"}</p></div><div className="alert-detail"><strong>{alert.detail}</strong><span>{formatDate(alert.date)}</span><small>{alert.days < 0 ? `${Math.abs(alert.days)} días vencido` : alert.days === 0 ? "Vence hoy" : `En ${alert.days} días`}</small></div></button>)}</div> : <EmptyState title="Sin alertas próximas" text="No existen pagos o fechas de fin dentro de los próximos 30 días." />}</section></div>;
}

type SyncUiState = {
  state: "idle" | "syncing" | "success" | "error";
  message: string;
};

function GoogleSheetsView({
  data,
  onSave,
  onSync,
  syncState,
  notify,
}: {
  data: AppData;
  onSave: (config: GoogleSheetsConfig) => Promise<void>;
  onSync: () => Promise<void>;
  syncState: SyncUiState;
  notify: (message: string, tone?: "success" | "danger") => void;
}) {
  const [draft, setDraft] = useState<GoogleSheetsConfig>({
    ...emptyGoogleSheetsConfig(),
    ...data.googleSheets,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");

  const validate = () => {
    if (!isValidWebAppUrl(draft.webAppUrl)) {
      notify("Pega la URL de implementación de Apps Script terminada en /exec.", "danger");
      return false;
    }
    if (!draft.syncToken.trim()) {
      notify("Ingresa la misma clave SYNC_SECRET configurada en Apps Script.", "danger");
      return false;
    }
    return true;
  };

  const save = async (showNotice = true) => {
    if (!validate()) return false;
    try {
      await onSave({
        ...draft,
        webAppUrl: draft.webAppUrl.trim(),
        syncToken: draft.syncToken.trim(),
        remoteRevision: data.googleSheets?.remoteRevision || draft.remoteRevision,
        lastSyncAt: data.googleSheets?.lastSyncAt || draft.lastSyncAt,
      });
      if (showNotice) notify("Configuración aplicada únicamente a esta sesión.");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo aplicar la configuración.", "danger");
      return false;
    }
  };

  const test = async () => {
    if (!validate()) return;
    setTesting(true);
    setTestResult("");
    try {
      const result = await testGoogleSheetsConnection(draft);
      setTestResult(`${result.records} procesos · ${result.payments} pagos · revisión ${result.revision}`);
      notify("Conexión con Google Sheets verificada.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo conectar con Google Sheets.", "danger");
    } finally {
      setTesting(false);
    }
  };

  const sync = async () => {
    if (!(await save(false))) return;
    await onSync();
  };

  return (
    <div className="view-stack">
      <section className="sheets-hero">
        <div className="sheets-hero-icon"><FileSpreadsheet /></div>
        <div><span className="eyebrow">BASE CENTRAL COLABORATIVA</span><h3>Google Sheets conectado a GitHub Pages</h3><p>Todos los datos se consultan y guardan en la hoja. El navegador no conserva una base local.</p></div>
        <div className={`sync-indicator ${syncState.state}`}><i />{syncState.state === "syncing" ? "Sincronizando" : data.googleSheets?.lastSyncAt ? "Configurado" : "Sin configurar"}</div>
      </section>

      {syncState.message && <div className={`sync-banner ${syncState.state}`}>{syncState.state === "syncing" && <RefreshCw className="spin" />}{syncState.message}</div>}

      <div className="sheets-layout">
        <section className="panel sheets-config">
          <div className="panel-heading"><div><span className="eyebrow">CONEXIÓN</span><h3>Implementación de Apps Script</h3></div><Cloud /></div>
          <div className="sheets-form">
            <label className="span-2">URL de aplicación web<input type="url" placeholder="https://script.google.com/macros/s/.../exec" value={draft.webAppUrl} onChange={(event) => setDraft({ ...draft, webAppUrl: event.target.value })} /></label>
            <label className="span-2">Clave de sincronización<input type="password" autoComplete="off" placeholder="Misma clave configurada como SYNC_SECRET" value={draft.syncToken} onChange={(event) => setDraft({ ...draft, syncToken: event.target.value })} /></label>
            <label className="toggle-row"><input type="checkbox" checked={draft.autoSync} onChange={(event) => setDraft({ ...draft, autoSync: event.target.checked })} /><span><strong>Sincronización automática</strong><small>Concilia cambios al abrir la sesión y cada minuto.</small></span></label>
            <label className="toggle-row sensitive"><input type="checkbox" checked={draft.includeCredentials} onChange={(event) => setDraft({ ...draft, includeCredentials: event.target.checked })} /><span><strong>Incluir usuarios y contraseñas</strong><small>Solo actívelo si la hoja es privada y de acceso restringido.</small></span></label>
          </div>
          <div className="sheets-buttons">
            <button className="button secondary" onClick={test} disabled={testing || syncState.state === "syncing"}>{testing ? <RefreshCw className="spin" size={16} /> : <Link2 size={16} />} Probar conexión</button>
            <button className="button secondary" onClick={() => save()} disabled={syncState.state === "syncing"}><Save size={16} /> Aplicar en sesión</button>
            <button className="button primary" onClick={sync} disabled={syncState.state === "syncing"}><RefreshCw className={syncState.state === "syncing" ? "spin" : ""} size={16} /> Sincronizar ahora</button>
          </div>
          {testResult && <p className="connection-result"><Check size={15} />{testResult}</p>}
        </section>

        <section className="panel sheets-status">
          <div className="panel-heading"><div><span className="eyebrow">ESTADO</span><h3>Copia central</h3></div><ShieldCheck /></div>
          <div className="sync-stats">
            <div><CloudUpload /><span>Procesos en la nube</span><strong>{data.records.length}</strong></div>
            <div><CloudDownload /><span>Revisión remota</span><strong>{data.googleSheets?.remoteRevision || 0}</strong></div>
            <div><CalendarClock /><span>Última sincronización</span><strong>{data.googleSheets?.lastSyncAt ? new Date(data.googleSheets.lastSyncAt).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" }) : "Pendiente"}</strong></div>
          </div>
          <div className="sync-explainer">
            <h4>¿Qué se almacena?</h4>
            <p>Procesos, clientes, contratos, fechas, cartera, pagos, investigadores, revistas, avance, observaciones e historial. Los pagos se guardan además en una hoja separada para facilitar filtros y reportes.</p>
            <h4>Conciliación segura</h4>
            <p>Antes de subir, el sistema descarga la revisión vigente, combina cambios por ID y fecha de actualización, conserva eliminaciones y evita sobrescribir una edición simultánea.</p>
          </div>
        </section>
      </div>

      <section className="credentials-warning"><AlertCircle /><div><strong>La hoja debe permanecer privada</strong><p>GitHub Pages nunca contiene la clave y el navegador no la guarda. Si activa credenciales, Google Sheets las almacenará como celdas legibles para quienes tengan acceso a la hoja.</p></div></section>
    </div>
  );
}

function DataView({
  data,
  onData,
  notify,
}: {
  data: AppData;
  onData: (data: AppData) => Promise<void>;
  notify: (message: string, tone?: "success" | "danger") => void;
}) {
  const excelRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("Importando y conciliando archivos…");
    try {
      const result = await importExcelFiles(Array.from(files), data.records);
      const next = addAudit({ ...data, records: result.data, importedAt: new Date().toISOString() }, "Importación", `${result.files} archivo(s), ${result.imported} registros leídos; ${result.data.length} procesos consolidados`);
      await onData(next);
      notify(`Importación completa: ${result.data.length} procesos consolidados.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo importar el Excel.", "danger");
    } finally {
      setBusy("");
      if (excelRef.current) excelRef.current.value = "";
    }
  };
  return (
    <div className="view-stack">
      {busy && <div className="busy-banner"><RefreshCw className="spin" />{busy}</div>}
      <section className="data-actions cloud-data-actions">
        <article><div className="data-icon green"><Upload /></div><h3>Importar Excel a Google Sheets</h3><p>Los archivos se procesan en memoria y sus registros se guardan inmediatamente en la base central.</p><input ref={excelRef} type="file" accept=".xlsx,.xls" multiple hidden onChange={(event) => importFiles(event.target.files)} /><button className="button primary" onClick={() => excelRef.current?.click()}><FileSpreadsheet size={16} /> Seleccionar archivos</button></article>
        <article><div className="data-icon blue"><Download /></div><h3>Exportar reporte</h3><p>Genera un Excel desde los datos vigentes descargados de Google Sheets.</p><button className="button secondary" onClick={async () => { setBusy("Generando Excel…"); try { await exportWorkbook(data.records); notify("Reporte Excel generado."); } finally { setBusy(""); } }}><Download size={16} /> Descargar Excel</button></article>
      </section>
      <section className="data-grid">
        <article className="panel"><div className="panel-heading"><div><span className="eyebrow">ALMACENAMIENTO</span><h3>Modo exclusivamente remoto</h3></div><Cloud /></div><div className="remote-storage-card"><strong>{data.records.length} procesos en Google Sheets</strong><p>No se usa almacenamiento persistente del navegador ni una base incluida en GitHub. Cada creación, edición, eliminación o importación debe confirmarse en la hoja antes de actualizar la pantalla.</p><span><ShieldCheck size={15} /> La clave desaparece al cerrar o recargar la pestaña.</span></div></article>
        <article className="panel"><div className="panel-heading"><div><span className="eyebrow">TRAZABILIDAD</span><h3>Actividad reciente</h3></div><span className="count-chip">{data.auditLog.length}</span></div><div className="audit-list">{data.auditLog.slice(0, 8).map((entry: AuditEntry) => <div key={entry.id}><i /><div><strong>{entry.action}</strong><p>{entry.detail}</p><small>{new Date(entry.timestamp).toLocaleString("es-EC")}</small></div></div>)}{data.auditLog.length === 0 && <p className="muted">Aún no existen eventos registrados.</p>}</div></article>
      </section>
    </div>
  );
}

export default function EditorialApp() {
  const [data, setData] = useState<AppData | null>(null);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<EditorialRecord | null>(null);
  const [newRecord, setNewRecord] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);
  const [savedAt, setSavedAt] = useState("");
  const [syncState, setSyncState] = useState<SyncUiState>({ state: "idle", message: "" });
  const dataRef = useRef<AppData | null>(null);
  const syncingRef = useRef(false);

  const notify = useCallback((message: string, tone: "success" | "danger" = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3800);
  }, []);
  const persist = async (next: AppData) => {
    if (syncingRef.current) throw new Error("Espera a que termine la sincronización en curso.");
    const normalized = normalizeAppData(next);
    if (!normalized.googleSheets?.webAppUrl || !normalized.googleSheets.syncToken) {
      throw new Error("La sesión de Google Sheets no está configurada.");
    }
    syncingRef.current = true;
    setSyncState({ state: "syncing", message: "Guardando el cambio directamente en Google Sheets…" });
    try {
      const result = await syncGoogleSheets(normalized);
      dataRef.current = result.data;
      setData(result.data);
      setSavedAt(result.data.googleSheets?.lastSyncAt || new Date().toISOString());
      setSyncState({ state: "success", message: `Cambio confirmado en Google Sheets. Revisión ${result.remoteRevision}.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar en Google Sheets.";
      setSyncState({ state: "error", message });
      throw new Error(message);
    } finally {
      syncingRef.current = false;
    }
  };
  const ready = (next: AppData) => {
    const normalized = normalizeAppData(next);
    dataRef.current = normalized;
    setData(normalized);
    setSavedAt(normalized.googleSheets?.lastSyncAt || "");
  };

  const runGoogleSync = useCallback(async (manual = true) => {
    if (syncingRef.current) {
      if (manual) notify("Ya hay una sincronización en curso.", "danger");
      return;
    }
    const current = dataRef.current;
    if (!current?.googleSheets?.webAppUrl || !current.googleSheets.syncToken) return;
    syncingRef.current = true;
    setSyncState({ state: "syncing", message: "Descargando, conciliando y guardando cambios…" });
    try {
      const source = manual ? addAudit(current, "Google Sheets", "Sincronización manual solicitada") : current;
      const result = await syncGoogleSheets(source);
      const next = result.data;
      dataRef.current = next;
      setData(next);
      setSavedAt(next.googleSheets?.lastSyncAt || new Date().toISOString());
      setSyncState({ state: "success", message: `${result.mergedCount} procesos conciliados con Google Sheets. Revisión ${result.remoteRevision}.` });
      if (manual) notify("Google Sheets quedó sincronizado.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo sincronizar con Google Sheets.";
      setSyncState({ state: "error", message });
      if (manual) notify(message, "danger");
    } finally {
      syncingRef.current = false;
    }
  }, [notify]);

  const autoSync = data?.googleSheets?.autoSync;
  const sheetsUrl = data?.googleSheets?.webAppUrl;
  const sheetsToken = data?.googleSheets?.syncToken;

  useEffect(() => {
    if (!autoSync || !sheetsUrl || !sheetsToken) return;
    const initial = window.setTimeout(() => { void runGoogleSync(false); }, 2500);
    const interval = window.setInterval(() => { void runGoogleSync(false); }, 60000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [autoSync, sheetsUrl, sheetsToken, runGoogleSync]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const query = normalizeText(filters.search).toUpperCase();
    return data.records.filter((record) => {
      const haystack = normalizeText([record.client, record.topic, record.product, record.contractNumber, record.journal, record.investigator, record.status, record.indexation].join(" ")).toUpperCase();
      if (query && !haystack.includes(query)) return false;
      if (filters.status && statusBucket(record.status) !== filters.status) return false;
      if (filters.investigator && record.investigator !== filters.investigator) return false;
      if (filters.indexation && record.indexation !== filters.indexation) return false;
      if (filters.risk && paymentRisk(record) !== filters.risk) return false;
      if (filters.startDate && record.startDate && record.startDate < filters.startDate) return false;
      if (filters.endDate && record.endDate && record.endDate > filters.endDate) return false;
      return true;
    });
  }, [data, filters]);

  if (!data) return <CloudAuthScreen onReady={ready} />;

  const saveRecord = async (record: EditorialRecord) => {
    const exists = data.records.some((item) => item.id === record.id);
    const records = exists ? data.records.map((item) => item.id === record.id ? record : item) : [record, ...data.records];
    try {
      await persist(addAudit({ ...data, records, deletedRecords: (data.deletedRecords || []).filter((item) => item.id !== record.id) }, exists ? "Edición" : "Creación", `${record.client} · ${record.contractNumber || "sin contrato"}`));
      setEditing(null); setNewRecord(false); notify("Registro guardado en Google Sheets.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo guardar el registro.", "danger");
    }
  };
  const deleteRecord = async (record: EditorialRecord) => {
    if (!window.confirm(`¿Eliminar el proceso de ${record.client}? Esta acción se guardará en Google Sheets.`)) return;
    const deletedAt = new Date().toISOString();
    try {
      await persist(addAudit({
        ...data,
        records: data.records.filter((item) => item.id !== record.id),
        deletedRecords: [...(data.deletedRecords || []).filter((item) => item.id !== record.id), { id: record.id, deletedAt }],
      }, "Eliminación", `${record.client} · ${record.contractNumber || "sin contrato"}`));
      setEditing(null); notify("Registro eliminado de Google Sheets.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo eliminar el registro.", "danger");
    }
  };
  const saveGoogleConfig = async (config: GoogleSheetsConfig) => {
    await persist(addAudit({ ...data, googleSheets: config, version: 3 }, "Google Sheets", "Configuración de sincronización actualizada"));
  };
  const title = NAV_ITEMS.find((item) => item.key === view)?.label || "Control editorial";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="sidebar-brand"><div className="brand-mark"><BookOpen size={21} /></div><div><strong>Sustainability</strong><span>Control editorial</span></div><button className="sidebar-close" onClick={() => setMobileMenu(false)}><X /></button></div>
        <nav>{NAV_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.key} className={view === item.key ? "active" : ""} onClick={() => { setView(item.key); setMobileMenu(false); }}><Icon size={18} /><span>{item.label}</span>{item.key === "alerts" && data.records.filter((record) => daysFromToday(record.nextPaymentDate || record.endDate) < 0 && record.progress < 100).length > 0 && <i className="nav-count">{data.records.filter((record) => daysFromToday(record.nextPaymentDate || record.endDate) < 0 && record.progress < 100).length}</i>}</button>; })}</nav>
        <div className="sidebar-bottom"><div className="secure-status"><Cloud /><div><strong>Base en Google Sheets</strong><span>{savedAt ? `Sincronizado ${new Date(savedAt).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}` : "Conexión activa"}</span></div></div><button onClick={() => { dataRef.current = null; setData(null); setSyncState({ state: "idle", message: "" }); }}><LockKeyhole size={17} /> Cerrar sesión</button></div>
      </aside>
      {mobileMenu && <button className="mobile-overlay" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú" />}
      <main className="main-area">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu(true)}><Menu /></button>
          <div><span className="eyebrow">CENTRO DE INVESTIGACIÓN</span><h1>{title}</h1></div>
          <div className="top-actions"><button className="icon-button notification" onClick={() => setView("alerts")}><Bell /><i /></button><button className="button primary" onClick={() => setNewRecord(true)}><Plus size={17} /> Nuevo proceso</button></div>
        </header>
        <div className="content">
          {view === "dashboard" && <Dashboard records={data.records} onEdit={setEditing} onNavigate={setView} />}
          {view === "processes" && <><FiltersBar filters={filters} setFilters={setFilters} records={data.records} /><ProcessesTable records={filtered} onEdit={setEditing} /></>}
          {view === "portfolio" && <PortfolioView records={data.records} onEdit={setEditing} />}
          {view === "investigators" && <InvestigatorsView records={data.records} />}
          {view === "contracts" && <ContractsView records={data.records} onEdit={setEditing} />}
          {view === "alerts" && <AlertsView records={data.records} onEdit={setEditing} />}
          {view === "google" && <GoogleSheetsView data={data} onSave={saveGoogleConfig} onSync={() => runGoogleSync(true)} syncState={syncState} notify={notify} />}
          {view === "data" && <DataView data={data} onData={persist} notify={notify} />}
        </div>
      </main>
      {(editing || newRecord) && <RecordModal source={editing || blankRecord()} onClose={() => { setEditing(null); setNewRecord(false); }} onSave={saveRecord} onDelete={editing ? deleteRecord : undefined} />}
      {toast && <div className={`toast ${toast.tone}`}><span>{toast.tone === "success" ? <Check /> : <AlertCircle />}</span>{toast.message}</div>}
    </div>
  );
}
