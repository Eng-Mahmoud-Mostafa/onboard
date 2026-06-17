import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BarChart3, Bot, Building2, CalendarCheck, CircleDollarSign, ClipboardCheck, ClipboardList, History, LayoutDashboard, LogOut, Mail, PackageOpen, Plane, Search, Send, Settings, ShieldCheck, Upload, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, AuthState, postJson } from "./api";

type Profile = { id: string; name: string; isAdmin: boolean };
type Lookup = { profiles: { id: string; name: string }[]; clients: { id: string; fullName: string }[]; companies: { id: string; name: string }[]; packages: { id: string; name: string }[]; bookings: { id: string; bookingCode: string }[] };
type FieldConfig = { name: string; label: string; type?: string; options?: { value: string; label: string }[]; required?: boolean; defaultValue?: string | number; placeholder?: string };
type Dashboard = {
  stats: { label: string; value: string | number; hint: string }[];
  profiles: Record<string, unknown>[];
  upcoming: { title: string; due: string; profile: string }[];
  activity: { message: string; date: string; profile: string }[];
  charts: {
    leadStatus: ChartDatum[];
    bookingStatus: ChartDatum[];
    taskStatus: ChartDatum[];
    revenueByProfile: ChartDatum[];
    topPackages: ChartDatum[];
    agencyBookings: ChartDatum[];
  };
  isAdmin: boolean;
};
type ChartDatum = { label: string; value: number };
type ResourceResponse = { rows: Record<string, unknown>[]; total: number; page: number; pageCount: number };
type DeploymentItem = { section: string; label: string; status: "ready" | "warning" | "missing"; detail: string };
type DeploymentChecklist = { items: DeploymentItem[]; summary: { ready: number; blocking: number; warnings: number; total: number } };
type ImportPreview = { type: string; totalRows: number; validRows: number; invalidRows: number; rows: { row: number; status: "valid" | "invalid"; issues: string[]; preview: Record<string, string> }[] };
type AiMessage = { role: "user" | "assistant"; text: string };
type DetailResponse = {
  title: string;
  subtitle: string;
  status: string;
  fields: [string, string | number][];
  related: Record<string, { title: string; meta: string }[]>;
  timeline?: { type: string; title: string; meta: string; date: string; tone: string }[];
  activity: { message: string; profile: string; date: string }[];
};
type SettingsResponse = {
  isAdmin: boolean;
  general: { profileName: string; email: string; role: string; lastLogin: string; appVersion: string; environment: string };
  values: Record<string, string | number | boolean>;
  safeConfig: Record<string, string | number>;
  lists: Record<string, string[]>;
  health: { name: string; status: string; detail: string }[];
  profiles: { id: string; name: string; role: string; status: string; lastActivity: string; leads: number; bookings: number }[];
  auditLogs: { action: string; profile: string; entity: string; date: string; details: string }[];
};
type SettingsField = { key: string; label: string; type: "text" | "number" | "select" | "toggle"; options?: string[] };

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Main" },
  { href: "/leads", label: "Leads", icon: ClipboardList, group: "Main" },
  { href: "/clients", label: "Clients", icon: Users, group: "Main" },
  { href: "/companies", label: "Agencies", icon: Building2, group: "Main" },
  { href: "/packages", label: "Packages", icon: PackageOpen, group: "Main" },
  { href: "/bookings", label: "Bookings", icon: Plane, group: "Main" },
  { href: "/payments", label: "Payments", icon: CircleDollarSign, group: "Main" },
  { href: "/tasks", label: "Tasks", icon: CalendarCheck, group: "Main" },
  { href: "/onboard-ai", label: "Onboard AI", icon: Bot, group: "Main" },
  { href: "/reports", label: "Reports", icon: BarChart3, group: "Admin", admin: true },
  { href: "/import-export", label: "Import / Export", icon: Upload, group: "Admin", admin: true },
  { href: "/deployment", label: "Deployment", icon: ClipboardCheck, group: "Admin", admin: true },
  { href: "/profiles", label: "Profiles", icon: ShieldCheck, group: "Admin", admin: true },
  { href: "/activity", label: "Activity Log", icon: History, group: "System" },
  { href: "/settings", label: "Settings", icon: Settings, group: "System" },
];

const resourceConfig = {
  leads: { title: "Leads", description: "Track inquiries, campaign sources, travel intent, status, and owners.", headers: ["Client", "Phone", "Source", "Status", "Profile", "Travel", "Updated"], labels: ["client", "phone", "source", "status", "profile", "travel", "updated"] },
  clients: { title: "Clients", description: "All passenger and customer records.", headers: ["Name", "Phone", "Email", "Agency", "Bookings", "Paid", "Remaining"], labels: ["name", "phone", "email", "company", "bookings", "paid", "remaining"] },
  companies: { title: "Agencies", description: "Manage travel agencies, corporate accounts, partners, contacts, and commission terms.", headers: ["Agency", "Type", "Status", "Contact", "Phone", "Commission", "Clients", "Bookings", "Profile"], labels: ["name", "type", "status", "contactPerson", "phone", "commission", "clients", "bookings", "profile"] },
  packages: { title: "Packages", description: "Tour products, destinations, pricing, capacity, and availability.", headers: ["Name", "Destination", "Duration", "Price", "Capacity", "Status"], labels: ["name", "destination", "duration", "price", "capacity", "status"] },
  bookings: { title: "Bookings", description: "Confirmed and pending travel bookings with balances.", headers: ["Code", "Client", "Agency", "Package", "Travel", "Total", "Paid", "Remaining", "Status", "Profile"], labels: ["code", "client", "company", "package", "travel", "total", "paid", "remaining", "status", "profile"] },
  payments: { title: "Payments", description: "Payments, methods, dates, and profile attribution.", headers: ["Booking", "Client", "Amount", "Method", "Date", "Profile"], labels: ["booking", "client", "amount", "method", "date", "profile"] },
  tasks: { title: "Tasks", description: "Follow-ups and reminders assigned to every profile.", headers: ["Task", "Due", "Priority", "Status", "Profile"], labels: ["task", "due", "priority", "status", "profile"] },
  activity: { title: "Activity Log", description: "A searchable history of CRM activity.", headers: ["Action", "Message", "Profile", "Date"], labels: ["action", "message", "profile", "date"] },
} as const;

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const refreshAuth = () => api<AuthState>("/api/auth/me").then(setAuth).catch(() => setAuth({ session: null, profile: null }));
  useEffect(() => { refreshAuth(); }, []);
  if (!auth) return <Splash />;
  return (
    <Routes>
      <Route path="/" element={<Login auth={auth} />} />
      <Route path="/verify" element={<Verify refreshAuth={refreshAuth} />} />
      <Route path="/profiles/reset" element={<ResetProfile />} />
      <Route path="/profiles" element={<Profiles auth={auth} refreshAuth={refreshAuth} />} />
      <Route path="/*" element={<Protected auth={auth}><Shell auth={auth} refreshAuth={refreshAuth} /></Protected>} />
    </Routes>
  );
}

function Splash() {
  return <main className="login-page"><div className="spinner" /></main>;
}

function Login({ auth }: { auth: AuthState }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("info@onboard-tours.com");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState("");
  if (auth.profile) return <Navigate to="/dashboard" replace />;
  if (auth.session) return <Navigate to="/profiles" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await postJson<{ next: string }>("/api/auth/request-otp", { email, keepSignedIn });
      navigate(result.next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send OTP.");
    }
  }
  return (
    <main className="login-page">
      <div className="login-glow" />
      <section className="login-shell">
        <div className="brand-lockup"><img src="/onboard-logo-transparent.png" alt="Onboard Travel & Tourism" /></div>
        <form onSubmit={submit} className="login-card">
          <div className="login-band">Sign in to your workspace</div>
          <div className="login-body">
            <div className="login-title">Welcome back</div>
            <p className="login-sub">Enter your work email to continue</p>
            <label className="form-label" htmlFor="work-email">Work Email</label>
            <input id="work-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@onboard-tours.com" required />
            <div className="field-hint">Use your @onboard-tours.com email</div>
            <label className="check-row">
              <input type="checkbox" checked={keepSignedIn} onChange={(event) => setKeepSignedIn(event.target.checked)} />
              <span>Keep me signed in</span>
            </label>
          {error && <p className="error">{error}</p>}
            <button className="primary">Send verification code</button>
            <div className="login-hint">A 6-digit code will be sent. Valid for 10 minutes.</div>
          </div>
        </form>
      </section>
    </main>
  );
}

function Verify({ refreshAuth }: { refreshAuth: () => Promise<void> }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const email = params.get("email") ?? "";
  const keepSignedIn = params.get("keep") === "1";
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await postJson<{ next: string }>("/api/auth/verify", { email, otp, keepSignedIn });
      await refreshAuth();
      navigate(result.next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify OTP.");
    }
  }
  return (
    <main className="login-page">
      <div className="login-glow" />
      <section className="login-shell">
        <div className="brand-lockup"><img src="/onboard-logo-transparent.png" alt="Onboard Travel & Tourism" /></div>
        <form onSubmit={submit} className="login-card">
          <div className="login-body">
          <Link className="back-button" to="/">Back</Link>
          <div className="mail-icon"><Mail size={22} /></div>
          <div className="login-title" style={{ textAlign: "center" }}>Check your email</div>
          <p className="login-sub" style={{ textAlign: "center" }}>Code sent to <strong>{email || "your work email"}</strong></p>
          <input value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" maxLength={6} className="otp" required />
          {error && <p className="error">{error}</p>}
          <button className="primary">Verify and continue</button>
          <div className="login-hint">Did not receive it? <Link to="/">Use a different email</Link></div>
          </div>
        </form>
      </section>
    </main>
  );
}

function Protected({ auth, children }: { auth: AuthState; children: ReactNode }) {
  if (!auth.session) return <Navigate to="/" replace />;
  if (!auth.profile) return <Navigate to="/profiles" replace />;
  return children;
}

function Shell({ auth, refreshAuth }: { auth: AuthState; refreshAuth: () => Promise<void> }) {
  const location = useLocation();
  const navigate = useNavigate();
  const profile = auth.profile!;
  async function signOut() {
    await postJson("/api/auth/signout", {});
    await refreshAuth();
    navigate("/");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo-wrap"><img src="/onboard-logo-transparent.png" alt="Onboard" /></div>
        <nav>
          {["Main", "Admin", "System"].map((group) => {
            const items = nav.filter((item) => item.group === group && (!item.admin || profile.isAdmin));
            if (!items.length) return null;
            return <div key={group} className="nav-group"><p className="nav-label">{group}</p>{items.map((item) => <Link className={`nav-item ${location.pathname === item.href ? "active" : ""}`} key={item.href} to={item.href}><item.icon />{item.label}</Link>)}</div>;
          })}
        </nav>
        <div className="user-section"><div className="user-card"><div className="avatar">{profile.profileName[0]}</div><div><b>{profile.profileName}</b><span>{profile.isAdmin ? "Admin workspace" : "Profile workspace"}</span></div></div></div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="search"><Search /><input placeholder="Search clients, bookings, tasks..." /></div>
          <div className="top-actions">{profile.isAdmin && <span className="badge red">Admin</span>}<span>{profile.profileName}</span><button className="ghost" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
        </header>
        <section className="content">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/leads" element={<ResourcePage resource="leads" profile={profile} />} />
            <Route path="/leads/:id" element={<DetailPage resource="leads" />} />
            <Route path="/clients" element={<ResourcePage resource="clients" profile={profile} />} />
            <Route path="/clients/:id" element={<DetailPage resource="clients" />} />
            <Route path="/companies" element={<ResourcePage resource="companies" profile={profile} />} />
            <Route path="/companies/:id" element={<DetailPage resource="companies" />} />
            <Route path="/packages" element={<ResourcePage resource="packages" profile={profile} />} />
            <Route path="/packages/:id" element={<DetailPage resource="packages" />} />
            <Route path="/bookings" element={<ResourcePage resource="bookings" profile={profile} />} />
            <Route path="/bookings/:id" element={<DetailPage resource="bookings" />} />
            <Route path="/payments" element={<ResourcePage resource="payments" profile={profile} />} />
            <Route path="/payments/:id" element={<DetailPage resource="payments" />} />
            <Route path="/tasks" element={<ResourcePage resource="tasks" profile={profile} />} />
            <Route path="/tasks/:id" element={<DetailPage resource="tasks" />} />
            <Route path="/onboard-ai" element={<OnboardAiPage />} />
            <Route path="/activity" element={<ResourcePage resource="activity" profile={profile} />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/import-export" element={<ImportExportPage />} />
            <Route path="/deployment" element={<DeploymentPage />} />
            <Route path="/settings" element={<SettingsPage auth={auth} refreshAuth={refreshAuth} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </section>
      </main>
    </div>
  );
}

function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="page-header"><div><div className="page-title">{title}</div><div className="page-sub">{description}</div></div>{action}</div>;
}

function DashboardPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/api/dashboard") });
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <Loading />;
  return (
    <>
      <PageHeader title="Dashboard" description="Travel sales, follow-up, booking, profile, and revenue overview." />
      <section className="stats">{data.stats.map((stat) => <div className="stat" key={stat.label}><span>{stat.label}</span><b>{stat.value}</b><small>{stat.hint}</small></div>)}</section>
      <section className="dashboard-charts">
        <ChartCard title="Lead pipeline" subtitle="Inquiry stages by visible profile data"><HorizontalBars data={data.charts.leadStatus} tone="red" /></ChartCard>
        <ChartCard title="Booking status" subtitle="Confirmed, pending, completed, and cancelled trips"><SegmentChart data={data.charts.bookingStatus} /></ChartCard>
        <ChartCard title="Task health" subtitle="Follow-up workload and completion"><SegmentChart data={data.charts.taskStatus} /></ChartCard>
        <ChartCard title="Revenue by profile" subtitle="Recorded payments ranked by owner"><HorizontalBars data={data.charts.revenueByProfile} money tone="green" /></ChartCard>
        <ChartCard title="Top packages" subtitle="Most booked products"><HorizontalBars data={data.charts.topPackages} tone="blue" /></ChartCard>
        <ChartCard title="Agency bookings" subtitle="Bookings linked to company accounts"><HorizontalBars data={data.charts.agencyBookings} tone="amber" /></ChartCard>
      </section>
      {data.isAdmin && <div className="dashboard-table"><DataTable headers={["Profile", "Role", "Leads", "Open tasks", "Bookings", "Revenue", "Conversion"]} labels={["profile", "role", "leads", "openTasks", "bookings", "revenue", "conversion"]} rows={data.profiles} /></div>}
      <section className="two-col">
        <div className="card"><h3>Upcoming tasks</h3>{data.upcoming.map((task, index) => <div className="mini-row" key={index}><b>{task.title}</b><span>{task.due} - {task.profile}</span></div>)}</div>
        <div className="card"><h3>Recent activity</h3>{data.activity.map((item, index) => <div className="mini-row active" key={index}><b>{item.message}</b><span>{item.profile} - {item.date}</span></div>)}</div>
      </section>
    </>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="chart-card"><div className="chart-head"><h3>{title}</h3><span>{subtitle}</span></div>{children}</div>;
}

function HorizontalBars({ data, money, tone }: { data: ChartDatum[]; money?: boolean; tone: "red" | "green" | "blue" | "amber" }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  const visible = data.filter((item) => item.value > 0);
  if (!visible.length) return <p className="empty chart-empty">No data yet.</p>;
  return <div className="bar-list">{visible.map((item) => <div className="bar-row" key={item.label}><div className="bar-meta"><span>{item.label}</span><b>{money ? moneyShort(item.value) : item.value}</b></div><div className="bar-track"><div className={`bar-fill ${tone}`} style={{ width: `${Math.max((item.value / max) * 100, 4)}%` }} /></div></div>)}</div>;
}

function SegmentChart({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <p className="empty chart-empty">No data yet.</p>;
  return <div className="segment-wrap"><div className="segment-bar">{data.filter((item) => item.value > 0).map((item, index) => <div className={`segment segment-${index % 5}`} key={item.label} style={{ width: `${(item.value / total) * 100}%` }} title={`${item.label}: ${item.value}`} />)}</div><div className="segment-legend">{data.map((item, index) => <div key={item.label}><i className={`segment-dot segment-${index % 5}`} /><span>{item.label}</span><b>{item.value}</b></div>)}</div></div>;
}

function moneyShort(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

function ResourcePage({ resource, profile }: { resource: keyof typeof resourceConfig; profile: NonNullable<AuthState["profile"]> }) {
  const config = resourceConfig[resource];
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [confirming, setConfirming] = useState<Record<string, unknown> | null>(null);
  const debounced = useDebouncedValue(q, 350);
  const { data: rows, isLoading, error } = useQuery({ queryKey: [resource, debounced, refresh], queryFn: () => api<ResourceResponse>(`/api/${resource}?q=${encodeURIComponent(debounced)}`) });
  const canCreate = canCreateResource(resource, profile);
  const canImport = profile.isAdmin && (resource === "leads" || resource === "tasks");
  const showActions = resource !== "activity" && (profile.isAdmin || resource !== "packages");
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <PageHeader title={config.title} description={config.description} action={canCreate ? <CreateDrawer resource={resource} onDone={() => setRefresh((x) => x + 1)} /> : undefined} />
      <div className="toolbar"><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search..." />{canImport ? <ImportExcel type={resource} onDone={() => setRefresh((x) => x + 1)} /> : null}</div>
      {rows && !isLoading ? <><DataTable headers={showActions ? [...config.headers, "Actions"] : config.headers} labels={config.labels} rows={rows.rows} resource={resource} onEdit={showActions ? setEditing : undefined} onDelete={showActions ? setConfirming : undefined} canManageRow={(row) => canManageRow(resource, row, profile)} onOpen={(row) => row.id && navigate(`/${resource}/${row.id}`)} /><PaginationMeta rows={rows} /></> : <Loading />}
      {editing && <RecordForm resource={resource} initial={editing} onClose={() => setEditing(null)} onDone={() => setRefresh((x) => x + 1)} />}
      {confirming && <ConfirmDialog resource={resource} row={confirming} onClose={() => setConfirming(null)} onDone={() => setRefresh((x) => x + 1)} />}
    </>
  );
}

function canCreateResource(resource: keyof typeof resourceConfig, profile: NonNullable<AuthState["profile"]>) {
  if (resource === "activity") return false;
  if (resource === "packages") return profile.isAdmin;
  return true;
}

function canManageRow(resource: keyof typeof resourceConfig, row: Record<string, unknown>, profile: NonNullable<AuthState["profile"]>) {
  if (resource === "activity") return false;
  if (profile.isAdmin) return true;
  if (resource === "packages") return false;
  const ownerId = resource === "payments" ? row.recordedById : row.assignedProfileId;
  return ownerId === profile.profileId;
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function PaginationMeta({ rows }: { rows: ResourceResponse }) {
  return <div className="pagination-meta">Page {rows.page} of {rows.pageCount} - {rows.total} records</div>;
}

function ErrorState({ error }: { error: unknown }) {
  return <div className="error">{error instanceof Error ? error.message : "Something went wrong."}</div>;
}

function DataTable({ headers, labels, rows, resource, onEdit, onDelete, onOpen, canManageRow }: { headers: readonly string[]; labels: readonly string[]; rows: Record<string, unknown>[]; resource?: string; onEdit?: (row: Record<string, unknown>) => void; onDelete?: (row: Record<string, unknown>) => void; onOpen?: (row: Record<string, unknown>) => void; canManageRow?: (row: Record<string, unknown>) => boolean }) {
  const hasActions = Boolean(onEdit || onDelete);
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => {
    const canManage = canManageRow ? canManageRow(row) : true;
    return <tr key={index} onClick={() => onOpen?.(row)}>{labels.map((label) => <td key={label}>{renderCell(label, row[label])}</td>)}{hasActions && <td>{canManage && <div className="table-actions">{onEdit && <button className="table-action" type="button" onClick={(event) => { event.stopPropagation(); onEdit(row); }}>Edit</button>}{onDelete && <button className="table-action danger" type="button" onClick={(event) => { event.stopPropagation(); onDelete(row); }}>{dangerLabel(resource)}</button>}</div>}</td>}</tr>;
  })}</tbody></table>{!rows.length && <p className="empty">No records yet.</p>}</div>;
}

function dangerLabel(resource?: string) {
  if (resource === "packages" || resource === "companies") return "Archive";
  if (resource === "bookings") return "Cancel";
  return "Delete";
}

function rowTitle(row: Record<string, unknown>) {
  return String(row.client ?? row.name ?? row.company ?? row.code ?? row.booking ?? row.task ?? row.title ?? row.amount ?? "this record");
}

function renderCell(label: string, value: unknown) {
  const text = String(value ?? "-");
  if (["status", "source", "priority", "method", "role", "type"].includes(label)) return <span className={`chip ${chipClass(text)}`}>{text}</span>;
  if (["paid", "remaining", "total", "amount", "revenue"].includes(label)) return <span className="cell-money">{text}</span>;
  if (["client", "name", "code", "task", "profile", "package"].includes(label)) return <span className="cell-strong">{text}</span>;
  return text;
}

function chipClass(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("paid") || normalized.includes("done") || normalized.includes("confirmed") || normalized.includes("converted") || normalized.includes("active") || normalized.includes("admin")) return "chip-green";
  if (normalized.includes("pending") || normalized.includes("follow") || normalized.includes("medium") || normalized.includes("website")) return "chip-amber";
  if (normalized.includes("new") || normalized.includes("facebook") || normalized.includes("instagram") || normalized.includes("contacted") || normalized.includes("user")) return "chip-blue";
  if (normalized.includes("cancel") || normalized.includes("lost") || normalized.includes("high") || normalized.includes("missed")) return "chip-red";
  return "chip-gray";
}

function CreateDrawer({ resource, onDone }: { resource: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return <>{<button className="primary small" onClick={() => setOpen(true)}>Add {singularLabel(resource)}</button>}{open && <RecordForm resource={resource} onClose={() => setOpen(false)} onDone={onDone} />}</>;
}

function RecordForm({ resource, onClose, onDone, initial }: { resource: string; onClose: () => void; onDone: () => void; initial?: Record<string, unknown> }) {
  const [lookups, setLookups] = useState<Lookup | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<Lookup>("/api/lookups").then(setLookups); }, []);
  const fields = useMemo(() => formFields(resource, lookups), [resource, lookups]);
  const isEditing = Boolean(initial?.id);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      if (isEditing) await api(`/api/${resource}/${initial?.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await postJson(`/api/crm/${resource}`, payload);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }
  return <div className="modal"><form className="drawer" onSubmit={submit}><h3>{isEditing ? "Edit" : "Add"} {singularLabel(resource)}</h3>{fields.map((field) => <Field key={field.name} {...field} defaultValue={fieldValue(field.name, initial, field.defaultValue)} />)}{error && <p className="error">{error}</p>}<div className="button-row"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary">{isEditing ? "Save changes" : "Save"}</button></div></form></div>;
}

function singularLabel(resource: string) {
  if (resource === "companies") return "agency";
  return resource.slice(0, -1);
}

function fieldValue(name: string, initial?: Record<string, unknown>, fallback?: string | number) {
  if (!initial) return fallback;
  if (name === "price" && initial.rawPrice != null) return String(initial.rawPrice);
  return initial[name] == null ? fallback : String(initial[name]);
}

function Field(field: FieldConfig) {
  if (field.options) return <label>{field.label}<select name={field.name} required={field.required} defaultValue={field.defaultValue}>{!field.required && <option value="">Not set</option>}{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  return <label>{field.label}<input name={field.name} type={field.type ?? "text"} required={field.required} defaultValue={field.defaultValue} placeholder={field.placeholder} /></label>;
}

function ConfirmDialog({ resource, row, onClose, onDone }: { resource: string; row: Record<string, unknown>; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState("");
  const label = dangerLabel(resource);
  async function confirm() {
    setError("");
    try {
      await api(`/api/${resource}/${row.id}`, { method: "DELETE" });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete action.");
    }
  }
  return (
    <div className="modal">
      <div className="confirm-card">
        <h3>{label} {rowTitle(row)}?</h3>
        <p>{confirmMessage(resource)}</p>
        {error && <p className="error">{error}</p>}
        <div className="button-row">
          <button type="button" className="ghost" onClick={onClose}>Keep record</button>
          <button type="button" className="primary danger" onClick={confirm}>{label}</button>
        </div>
      </div>
    </div>
  );
}

function confirmMessage(resource: string) {
  if (resource === "companies") return "Agencies with linked clients or bookings will be archived to keep history safe.";
  if (resource === "packages") return "This package will be archived and hidden from active package selection.";
  if (resource === "bookings") return "This booking will be marked as cancelled and kept for history.";
  if (resource === "payments") return "This payment will be deleted and the booking balance will be recalculated.";
  if (resource === "clients") return "Clients with bookings cannot be deleted. This keeps booking history safe.";
  return "This action cannot be undone.";
}

function formFields(resource: string, lookups: Lookup | null): FieldConfig[] {
  const profileOptions = (lookups?.profiles ?? []).map((p) => ({ value: p.id, label: p.name }));
  const companyOptions = (lookups?.companies ?? []).map((x) => ({ value: x.id, label: x.name }));
  if (resource === "leads") return [
    { name: "clientName", label: "Client name", required: true, placeholder: "Client or lead name" },
    { name: "phone", label: "Phone", required: true, placeholder: "+20..." },
    { name: "email", label: "Email", type: "email", placeholder: "Optional" },
    { name: "source", label: "Source", required: true, options: ["FACEBOOK", "INSTAGRAM", "WHATSAPP", "WEBSITE", "REFERRAL", "WALK_IN", "OTHER"].map((x) => ({ value: x, label: x })) },
    { name: "interestedDestination", label: "Interested destination", placeholder: "Optional" },
    { name: "interestedPackage", label: "Interested package", placeholder: "Optional" },
    { name: "budget", label: "Budget", type: "number", placeholder: "Optional" },
    { name: "travelDate", label: "Travel date", type: "date" },
    { name: "travelers", label: "Travelers", type: "number", defaultValue: 1, required: true },
    { name: "status", label: "Status", required: true, options: ["NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP", "CONVERTED", "LOST"].map((x) => ({ value: x, label: x })) },
    { name: "assignedProfileId", label: "Assigned profile", options: profileOptions },
    { name: "notes", label: "Notes", placeholder: "Optional" },
  ];
  if (resource === "clients") return [
    { name: "fullName", label: "Full name", required: true },
    { name: "phone", label: "Phone", required: true },
    { name: "email", label: "Email", type: "email", placeholder: "Optional" },
    { name: "companyId", label: "Company / agency", options: companyOptions },
    { name: "nationality", label: "Nationality", placeholder: "Optional" },
    { name: "passportNumber", label: "Passport number", placeholder: "Optional" },
    { name: "notes", label: "Notes", placeholder: "Optional" },
  ];
  if (resource === "companies") return [
    { name: "name", label: "Agency name", required: true },
    { name: "type", label: "Type", required: true, options: ["TRAVEL_AGENCY", "CORPORATE", "HOTEL", "PARTNER", "OTHER"].map((x) => ({ value: x, label: x })) },
    { name: "status", label: "Status", required: true, options: ["ACTIVE", "INACTIVE", "ARCHIVED"].map((x) => ({ value: x, label: x })) },
    { name: "contactPerson", label: "Contact person", placeholder: "Optional" },
    { name: "phone", label: "Phone", placeholder: "Optional" },
    { name: "email", label: "Email", type: "email", placeholder: "Optional" },
    { name: "address", label: "Address", placeholder: "Optional" },
    { name: "taxId", label: "Tax ID", placeholder: "Optional" },
    { name: "commissionPercent", label: "Commission %", type: "number", placeholder: "Optional" },
    { name: "assignedProfileId", label: "Assigned profile", options: profileOptions },
    { name: "notes", label: "Notes", placeholder: "Optional" },
  ];
  if (resource === "packages") return [
    { name: "name", label: "Name", required: true },
    { name: "destination", label: "Destination", required: true },
    { name: "duration", label: "Duration", required: true },
    { name: "price", label: "Price", type: "number", required: true },
    { name: "description", label: "Description", required: true },
    { name: "includedServices", label: "Included services", required: true },
    { name: "excludedServices", label: "Excluded services", required: true },
    { name: "capacity", label: "Capacity", type: "number", required: true },
    { name: "status", label: "Status", required: true, options: ["ACTIVE", "DRAFT", "ARCHIVED"].map((x) => ({ value: x, label: x })) },
  ];
  if (resource === "tasks") return [
    { name: "title", label: "Task title", required: true },
    { name: "description", label: "Description", placeholder: "Optional" },
    { name: "dueAt", label: "Due date", type: "datetime-local", required: true },
    { name: "priority", label: "Priority", required: true, options: ["LOW", "MEDIUM", "HIGH"].map((x) => ({ value: x, label: x })) },
    { name: "status", label: "Status", required: true, options: ["PENDING", "DONE", "MISSED"].map((x) => ({ value: x, label: x })) },
    { name: "assignedProfileId", label: "Assigned profile", options: profileOptions },
  ];
  if (resource === "bookings") return [
    { name: "clientId", label: "Client", required: true, options: (lookups?.clients ?? []).map((x) => ({ value: x.id, label: x.fullName })) },
    { name: "companyId", label: "Company / agency", options: companyOptions },
    { name: "packageId", label: "Package", options: (lookups?.packages ?? []).map((x) => ({ value: x.id, label: x.name })) },
    { name: "travelDate", label: "Travel date", type: "date", required: true },
    { name: "travelers", label: "Travelers", type: "number", required: true },
    { name: "totalPrice", label: "Total price", type: "number", required: true },
    { name: "paidAmount", label: "Paid amount", type: "number", defaultValue: 0 },
    { name: "bookingStatus", label: "Status", required: true, options: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"].map((x) => ({ value: x, label: x })) },
    { name: "assignedProfileId", label: "Assigned profile", options: profileOptions },
    { name: "notes", label: "Notes", placeholder: "Optional" },
  ];
  if (resource === "payments") return [
    { name: "bookingId", label: "Booking", required: true, options: (lookups?.bookings ?? []).map((x) => ({ value: x.id, label: x.bookingCode })) },
    { name: "amountPaid", label: "Amount", type: "number", required: true },
    { name: "paymentMethod", label: "Method", required: true, options: ["CASH", "BANK_TRANSFER", "INSTAPAY", "VODAFONE_CASH", "CARD", "OTHER"].map((x) => ({ value: x, label: x })) },
    { name: "paymentDate", label: "Date", type: "date", required: true },
    { name: "notes", label: "Notes", placeholder: "Optional" },
  ];
  return [];
}

function ImportExcel({ type, onDone }: { type: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const selected = new FormData(event.currentTarget).get("file");
    if (!(selected instanceof File) || !selected.name) {
      setError("Choose an Excel file first.");
      return;
    }
    setFile(selected);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", selected);
      setPreview(await api<ImportPreview>(`/api/import/${type}/preview`, { method: "POST", body: form }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not preview import.");
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      await api(`/api/import/${type}`, { method: "POST", body: form });
      setPreview(null);
      setFile(null);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import file.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <form onSubmit={submit} className="import"><input name="file" type="file" accept=".xlsx,.xls,.csv" /><button className="ghost" disabled={busy}><Upload size={14} /> Preview</button>{error && <span className="inline-error">{error}</span>}</form>
    {preview && <ImportPreviewModal preview={preview} busy={busy} error={error} onClose={() => setPreview(null)} onConfirm={confirm} />}
  </>;
}

function ImportPreviewModal({ preview, busy, error, onClose, onConfirm }: { preview: ImportPreview; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  const columns = Array.from(preview.rows.reduce((set, row) => {
    Object.keys(row.preview).forEach((key) => set.add(key));
    return set;
  }, new Set<string>())).slice(0, 6);
  return <div className="modal"><div className="import-preview"><div className="card-header"><div><div className="card-title">Import preview</div><p>{preview.totalRows} rows scanned for {preview.type}</p></div><button className="ghost" onClick={onClose}>Close</button></div><section className="stats compact"><div className="stat"><span>Valid</span><b>{preview.validRows}</b><small>Ready to import</small></div><div className="stat"><span>Invalid</span><b>{preview.invalidRows}</b><small>Skipped until fixed</small></div><div className="stat"><span>Preview</span><b>{preview.rows.length}</b><small>Rows shown</small></div></section><div className="preview-table"><table><thead><tr><th>Row</th><th>Status</th>{columns.map((column) => <th key={column}>{titleCase(column)}</th>)}<th>Issues</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.row}><td>{row.row}</td><td><span className={`chip ${row.status === "valid" ? "chip-green" : "chip-red"}`}>{row.status}</span></td>{columns.map((column) => <td key={column}>{row.preview[column] || "-"}</td>)}<td>{row.issues.length ? row.issues.join(", ") : "-"}</td></tr>)}</tbody></table></div>{error && <p className="error">{error}</p>}<div className="button-row"><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || preview.validRows === 0} onClick={onConfirm}>{busy ? "Importing..." : `Import ${preview.validRows} rows`}</button></div></div></div>;
}

function Profiles({ auth, refreshAuth }: { auth: AuthState; refreshAuth: () => Promise<void> }) {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { if (auth.session) api<{ profiles: Profile[] }>("/api/profiles").then((data) => setProfiles(data.profiles)); }, [auth.session]);
  if (!auth.session) return <Navigate to="/" replace />;
  async function unlock(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    try {
      const result = await postJson<{ next: string }>("/api/profiles/unlock", { profileId: id, password });
      await refreshAuth();
      navigate(result.next);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not unlock profile."); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    await postJson("/api/profiles", payload);
    const data = await api<{ profiles: Profile[] }>("/api/profiles");
    setProfiles(data.profiles);
  }
  return (
    <main className="profile-page">
      <div className="login-glow" />
      <section className="profile-shell">
        <div className="brand-lockup"><img src="/onboard-logo-transparent.png" alt="Onboard" /></div>
        <div className="page-header"><div><div className="page-title">Choose profile</div><div className="page-sub">Unlock the CRM workspace you want to work in.</div></div></div>
        <section className="profile-grid">
          {profiles.map((profile) => <form className="profile-card" key={profile.id} onSubmit={(event) => unlock(event, profile.id)}><div className="avatar">{profile.name[0]}</div><h3>{profile.name}</h3><p>{profile.isAdmin ? "Admin" : "Employee"}</p><input name="password" type="password" placeholder="Profile password" required /><button className="primary">Open CRM</button><button type="button" className="ghost" onClick={async () => { const result = await postJson<{ next: string }>("/api/profiles/reset/request", { profileId: profile.id }); navigate(result.next); }}>Reset password</button></form>)}
          <form className="profile-card" onSubmit={create}><div className="avatar">+</div><h3>Create profile</h3><p>Add a new employee workspace.</p><input name="name" placeholder="Employee name" required /><input name="password" type="password" placeholder="Profile password" required /><button className="primary">Create</button></form>
        </section>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}

function ResetProfile() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    await postJson("/api/profiles/reset/confirm", payload);
    navigate("/profiles");
  }
  return <main className="login-page"><div className="login-glow" /><form className="login-card panel reset" onSubmit={submit}><h1>Reset profile password</h1><p className="login-sub">Enter the reset OTP and choose a new profile password.</p><input type="hidden" name="profileId" value={params.get("profileId") ?? ""} /><input name="otp" placeholder="Reset OTP" required /><input name="password" type="password" placeholder="New password" required /><button className="primary">Reset password</button></form></main>;
}

function ReportsPage() {
  const { data } = useQuery({ queryKey: ["reports-summary"], queryFn: () => api<{ leads: number; bookings: number; revenue: number }>("/api/reports/summary") });
  return <><PageHeader title="Reports" description="Admin reporting for revenue, conversion, bookings, and follow-up performance." /><section className="stats compact"><div className="stat"><span>Total leads</span><b>{data?.leads ?? "-"}</b><small>All profiles</small></div><div className="stat"><span>Bookings</span><b>{data?.bookings ?? "-"}</b><small>All trips</small></div><div className="stat"><span>Revenue</span><b>{data ? `$${data.revenue.toLocaleString()}` : "-"}</b><small>Recorded payments</small></div></section><div className="card">Detailed report endpoints are available for leads by source, revenue by profile, package bookings, and follow-up completion.</div></>;
}

function DeploymentPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["deployment-checklist"], queryFn: () => api<DeploymentChecklist>("/api/deployment/checklist") });
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <Loading />;
  const sections = Array.from(new Set(data.items.map((item) => item.section)));
  return (
    <>
      <PageHeader title="Deployment checklist" description="Production readiness for hosting, database, email, storage, auth, and release safety." />
      <section className="stats compact">
        <div className="stat"><span>Ready</span><b>{data.summary.ready}</b><small>{data.summary.total} checks</small></div>
        <div className="stat"><span>Blocking</span><b>{data.summary.blocking}</b><small>Must be fixed</small></div>
        <div className="stat"><span>Warnings</span><b>{data.summary.warnings}</b><small>Review before launch</small></div>
      </section>
      <section className="deploy-grid">
        {sections.map((section) => <div className="card deploy-card" key={section}><div className="card-header"><div className="card-title">{section}</div></div>{data.items.filter((item) => item.section === section).map((item) => <div className="deploy-row" key={item.label}><span className={`deploy-check ${item.status}`} /> <div><b>{item.label}</b><p>{item.detail}</p></div><em className={`chip ${deploymentChip(item.status)}`}>{item.status}</em></div>)}</div>)}
      </section>
      <section className="card deploy-steps">
        <div className="card-header"><div className="card-title">Release commands</div></div>
        {["npm run build", "npx prisma migrate deploy", "npx prisma generate", "npm run start"].map((command) => <code key={command}>{command}</code>)}
      </section>
    </>
  );
}

function deploymentChip(status: DeploymentItem["status"]) {
  if (status === "ready") return "chip-green";
  if (status === "warning") return "chip-amber";
  return "chip-red";
}

function OnboardAiPage() {
  const [messages, setMessages] = useState<AiMessage[]>([{ role: "assistant", text: "Hi, I am Onboard AI. Ask me about CRM workflows, follow-ups, bookings, payments, tasks, or travel sales wording." }]);
  const [draft, setDraft] = useState("");
  const [isWriting, setIsWriting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isWriting) return;
    const nextMessages: AiMessage[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setIsWriting(true);
    try {
      const result = await api<{ message: string }>("/api/ai/support", { method: "POST", body: JSON.stringify({ messages: nextMessages }) });
      setMessages([...nextMessages, { role: "assistant", text: result.message }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboard AI could not answer right now.");
    } finally {
      setIsWriting(false);
    }
  }

  return (
    <>
      <PageHeader title="Onboard AI" description="AI support for CRM workflows, travel sales follow-ups, bookings, payments, and task operations." />
      <section className="ai-panel">
        <div className="ai-thread">
          {messages.map((message, index) => <div className={`ai-message ${message.role}`} key={index}><div className="ai-avatar">{message.role === "assistant" ? "AI" : "You"}</div><div><b>{message.role === "assistant" ? "Onboard AI" : "You"}</b><p>{message.text}</p></div></div>)}
          {isWriting && <div className="ai-writing">Onboard AI is writing...</div>}
          {error && <p className="error">{error}</p>}
        </div>
        <form className="ai-compose" onSubmit={submit}>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask Onboard AI..." rows={3} />
          <button className="primary" disabled={isWriting || !draft.trim()}><Send size={15} /> Send</button>
        </form>
      </section>
    </>
  );
}

function DetailPage({ resource }: { resource: string }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ["detail", resource, id], queryFn: () => api<DetailResponse>(`/api/${resource}/${id}`), enabled: Boolean(id) });
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <Loading />;
  const relatedEntries = Object.entries(data.related).filter(([, items]) => items.length);
  return (
    <>
      <div className="detail-hero">
        <button className="ghost" onClick={() => navigate(`/${resource}`)}>Back</button>
        <div>
          <div className="page-title">{data.title}</div>
          <div className="page-sub">{data.subtitle}</div>
        </div>
        <span className={`chip ${chipClass(data.status)}`}>{data.status}</span>
      </div>
      <section className="detail-grid">
        <div className="card detail-card">
          <div className="card-header"><div className="card-title">Details</div></div>
          <div className="detail-fields">{data.fields.map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><b>{String(value ?? "-")}</b></div>)}</div>
        </div>
        <div className="card detail-card">
          <div className="card-header"><div className="card-title">Recent activity</div></div>
          {data.activity.length ? data.activity.map((item, index) => <div className="mini-row active" key={index}><b>{item.message}</b><span>{item.profile} - {item.date}</span></div>) : <p className="empty">No activity yet.</p>}
        </div>
      </section>
      {data.timeline?.length ? <section className="card timeline-card">
        <div className="card-header"><div className="card-title">Booking timeline</div></div>
        <div className="timeline-list">{data.timeline.map((item, index) => <div className={`timeline-item ${item.tone}`} key={`${item.type}-${index}`}><div className="timeline-dot" /><div><div className="timeline-title"><b>{item.title}</b><span>{item.date}</span></div><p>{item.meta}</p></div></div>)}</div>
      </section> : null}
      <section className="detail-related">
        {relatedEntries.map(([name, items]) => <div className="card detail-card" key={name}><div className="card-header"><div className="card-title">{titleCase(name)}</div></div>{items.map((item, index) => <div className="mini-row" key={index}><b>{item.title}</b><span>{item.meta}</span></div>)}</div>)}
      </section>
    </>
  );
}

function titleCase(value: string) {
  return value.replace(/(^|\s)\w/g, (match) => match.toUpperCase());
}

function ImportExportPage() {
  const [message, setMessage] = useState("");
  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const result = await api<{ file: { fileName: string } }>("/api/files/upload", { method: "POST", body: form });
    setMessage(`Uploaded ${result.file.fileName}.`);
  }
  return (
    <>
      <PageHeader title="Import / Export" description="Import operational data, export admin CSVs, and attach booking or client documents." />
      <section className="import-grid">
        <div className="card">
          <h3>Data import</h3>
          <p className="muted">Upload Excel or CSV files for leads and clients. Rows are validated before creation.</p>
          <ImportExcel type="leads" onDone={() => setMessage("Lead import finished.")} />
          <ImportExcel type="clients" onDone={() => setMessage("Client import finished.")} />
        </div>
        <div className="card">
          <h3>CSV export</h3>
          <p className="muted">Admin exports are generated server-side and logged in the activity feed.</p>
          <div className="export-buttons">{["leads", "clients", "companies", "bookings", "payments", "reports"].map((type) => <a className="ghost" href={`/api/export/${type}?format=csv`} key={type}>Export {type}</a>)}</div>
        </div>
      </section>
      <section className="card" style={{ padding: 20 }}>
        <div className="step-indicator">
          <div className="step active"><div className="step-num">1</div> Upload</div>
          <div className="step-sep">-</div>
          <div className="step"><div className="step-num">2</div> Validate</div>
          <div className="step-sep">-</div>
          <div className="step"><div className="step-num">3</div> Results</div>
        </div>
        <form onSubmit={uploadFile}>
          <label className="dropzone">
            <Upload />
            <div className="dropzone-title">Drop your file here</div>
            <div className="dropzone-sub">or click to browse. Files are stored in Supabase Storage.</div>
            <input name="file" type="file" required style={{ display: "none" }} />
          </label>
          <div style={{ marginTop: 16 }}><button className="primary small">Upload file</button></div>
        </form>
        <div style={{ marginTop: 16 }}>
          <div className="result-grid">
            <div className="result-card"><div className="result-num" style={{ color: "#22c55e" }}>CSV</div><div className="result-label">Exports</div></div>
            <div className="result-card"><div className="result-num" style={{ color: "#6366f1" }}>XLS</div><div className="result-label">Imports</div></div>
            <div className="result-card"><div className="result-num" style={{ color: "#e8003d" }}>DB</div><div className="result-label">Logged</div></div>
          </div>
        </div>
      </section>
      {message && <p className="success">{message}</p>}
    </>
  );
}

const settingsTabs = [
  { id: "general", label: "General", admin: false },
  { id: "company", label: "Company", admin: true },
  { id: "profiles", label: "Profiles & Permissions", admin: true },
  { id: "leads", label: "Leads", admin: true },
  { id: "bookings", label: "Bookings", admin: true },
  { id: "payments", label: "Payments", admin: true },
  { id: "packages", label: "Packages", admin: true },
  { id: "tasks", label: "Tasks", admin: false },
  { id: "ai", label: "AI Chatbot", admin: false },
  { id: "email", label: "Email & OTP", admin: true },
  { id: "import", label: "Import / Export", admin: true },
  { id: "security", label: "Security", admin: true },
  { id: "health", label: "System Health", admin: false },
  { id: "audit", label: "Audit Logs", admin: true },
] as const;

const settingsFields: Record<string, SettingsField[]> = {
  company: [
    { key: "company.name", label: "Company name", type: "text" },
    { key: "company.crmName", label: "CRM display name", type: "text" },
    { key: "company.emailDomain", label: "Company email domain", type: "text" },
    { key: "company.crmDomain", label: "CRM domain", type: "text" },
    { key: "company.phone", label: "Company phone", type: "text" },
    { key: "company.address", label: "Company address", type: "text" },
    { key: "company.currency", label: "Default currency", type: "select", options: ["EGP", "USD", "EUR", "SAR", "AED"] },
    { key: "company.timezone", label: "Default timezone", type: "select", options: ["Africa/Cairo", "UTC", "Europe/London", "Asia/Dubai", "Asia/Riyadh"] },
  ],
  leads: [
    { key: "leads.autoAssign", label: "Auto-assign leads", type: "toggle" },
    { key: "leads.duplicateDetection", label: "Duplicate detection by phone/email", type: "toggle" },
    { key: "leads.requireLostReason", label: "Require reason when lead is Lost", type: "toggle" },
  ],
  bookings: [
    { key: "bookings.idFormat", label: "Booking ID format", type: "text" },
    { key: "bookings.taxFee", label: "Default tax/service fee", type: "number" },
    { key: "bookings.adminCancelApproval", label: "Require admin approval for cancellation", type: "toggle" },
  ],
  payments: [
    { key: "payments.allowPartial", label: "Allow partial payments", type: "toggle" },
    { key: "payments.requireReceipt", label: "Require payment receipt upload", type: "toggle" },
    { key: "payments.adminConfirmation", label: "Require admin confirmation for payments", type: "toggle" },
  ],
  packages: [
    { key: "packages.salesCanCreate", label: "Allow sales profiles to create packages", type: "toggle" },
    { key: "packages.adminApproval", label: "Require admin approval for publishing", type: "toggle" },
    { key: "packages.defaultCapacity", label: "Default package capacity", type: "number" },
  ],
  tasks: [
    { key: "tasks.defaultFollowUpTime", label: "Default follow-up time", type: "text" },
    { key: "tasks.overdueWarning", label: "Overdue task warning", type: "toggle" },
    { key: "tasks.dailySummary", label: "Daily task summary", type: "toggle" },
    { key: "tasks.dashboardOverdue", label: "Show overdue tasks on dashboard", type: "toggle" },
  ],
  ai: [
    { key: "ai.enabled", label: "AI chatbot enabled", type: "toggle" },
    { key: "ai.crmAccess", label: "Allow AI to access CRM data", type: "toggle" },
    { key: "ai.summarizeLeads", label: "Allow lead summaries", type: "toggle" },
    { key: "ai.followUpMessages", label: "Generate follow-up messages", type: "toggle" },
    { key: "ai.packageDescriptions", label: "Generate package descriptions", type: "toggle" },
    { key: "ai.chatHistory", label: "Save chat history", type: "toggle" },
    { key: "ai.dailyLimit", label: "Daily usage limit per profile", type: "number" },
  ],
  import: [
    { key: "import.duplicates", label: "Duplicate handling", type: "select", options: ["skip", "update", "create"] },
  ],
  security: [
    { key: "security.sessionTimeout", label: "Session timeout", type: "text" },
    { key: "security.profileInactivityLock", label: "Require profile password after inactivity", type: "toggle" },
    { key: "security.adminSensitiveConfirm", label: "Admin confirmation for sensitive actions", type: "toggle" },
  ],
  audit: [
    { key: "audit.trackLeadChanges", label: "Track lead changes", type: "toggle" },
    { key: "audit.trackBookingChanges", label: "Track booking changes", type: "toggle" },
    { key: "audit.trackPaymentChanges", label: "Track payment changes", type: "toggle" },
    { key: "audit.trackExports", label: "Track exports", type: "toggle" },
    { key: "audit.trackProfileUnlocks", label: "Track profile unlocks", type: "toggle" },
    { key: "audit.trackAiUsage", label: "Track AI usage", type: "toggle" },
    { key: "audit.trackDeletedRecords", label: "Track deleted records", type: "toggle" },
  ],
};

function SettingsPage({ auth, refreshAuth }: { auth: AuthState; refreshAuth: () => Promise<void> }) {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsResponse>("/api/settings") });
  const [active, setActive] = useState("general");
  const [draft, setDraft] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => void } | null>(null);

  useEffect(() => { if (data) setDraft(data.values); }, [data]);
  useEffect(() => {
    if (data && settingsTabs.find((tab) => tab.id === active)?.admin && !data.isAdmin) setActive("general");
  }, [active, data]);

  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <><PageHeader title="Settings" description="Loading workspace controls." /><Loading /></>;

  const tabs = settingsTabs.filter((tab) => !tab.admin || data.isAdmin);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.values);
  const canEdit = data.isAdmin;

  function updateValue(key: string, value: string | number | boolean) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await api<{ values: Record<string, string | number | boolean> }>("/api/settings", { method: "PATCH", body: JSON.stringify({ updates: draft }) });
      setDraft(result.values);
      await refetch();
      setToast("Settings saved.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await postJson("/api/auth/signout", {});
    await refreshAuth();
    navigate("/");
  }

  return (
    <>
      <PageHeader title="Settings" description="Workspace controls, safe integration statuses, permissions, and system health." />
      {toast && <div className="toast" onAnimationEnd={() => setToast("")}>{toast}</div>}
      <section className="settings-shell">
        <aside className="settings-menu">
          {tabs.map((tab) => <button key={tab.id} className={active === tab.id ? "active" : ""} onClick={() => setActive(tab.id)}>{tab.label}</button>)}
        </aside>
        <main className="settings-content">
          {active === "general" && <SettingsGeneral data={data} auth={auth} onLock={() => navigate("/profiles")} onSignOut={() => setConfirm({ title: "Sign out?", body: "This will end the current account session on this device.", action: signOut })} />}
          {active === "company" && <EditableSettings title="Company settings" description="Brand, domain, currency, and timezone defaults." fields={settingsFields.company} values={draft} canEdit={canEdit} onChange={updateValue} extra={<LogoUploadStub />} />}
          {active === "profiles" && <ProfilesSettings data={data} />}
          {active === "leads" && <EditableSettings title="Leads settings" description="Sources, statuses, assignment, duplicates, and lead quality controls." fields={settingsFields.leads} values={draft} canEdit={canEdit} onChange={updateValue} extra={<ListCard title="Lead lists" lists={[["Sources", data.lists.leadSources], ["Statuses", data.lists.leadStatuses]]} />} />}
          {active === "bookings" && <EditableSettings title="Bookings settings" description="Booking statuses, payment statuses, booking ID format, and approval rules." fields={settingsFields.bookings} values={draft} canEdit={canEdit} onChange={updateValue} extra={<ListCard title="Booking lists" lists={[["Booking statuses", data.lists.bookingStatuses], ["Payment statuses", data.lists.paymentStatuses], ["Cancellation reasons", ["Client request", "Payment issue", "Date unavailable", "Other"]]]} />} />}
          {active === "payments" && <EditableSettings title="Payments settings" description="Payment methods, receipts, confirmations, and edit/delete controls." fields={settingsFields.payments} values={draft} canEdit={canEdit} onChange={updateValue} extra={<ListCard title="Payment methods" lists={[["Methods", data.lists.paymentMethods], ["Permissions", ["Admin can delete payments", "Accounting can edit payments", "Sales can view assigned payments"]]]} />} />}
          {active === "packages" && <EditableSettings title="Packages settings" description="Destinations, categories, publishing controls, and default package values." fields={settingsFields.packages} values={draft} canEdit={canEdit} onChange={updateValue} extra={<ListCard title="Package lists" lists={[["Categories", data.lists.packageCategories], ["Statuses", data.lists.packageStatuses], ["Destinations", ["Egypt", "Turkey", "Dubai", "Saudi Arabia", "Europe"]]]} />} />}
          {active === "tasks" && <EditableSettings title="Tasks settings" description="Follow-up defaults, reminders, overdue handling, and task visibility." fields={settingsFields.tasks} values={draft} canEdit={canEdit} onChange={updateValue} extra={<ListCard title="Task lists" lists={[["Priorities", data.lists.taskPriorities], ["Statuses", data.lists.taskStatuses]]} />} />}
          {active === "ai" && <EditableSettings title="AI Chatbot settings" description="Safe Onboard AI status and allowed CRM assistance controls." fields={settingsFields.ai} values={draft} canEdit={canEdit} onChange={updateValue} extra={<AiStatus data={data} />} />}
          {active === "email" && <EmailSettings data={data} />}
          {active === "import" && <EditableSettings title="Import / Export settings" description="Admin data movement controls and duplicate handling." fields={settingsFields.import} values={draft} canEdit={canEdit} onChange={updateValue} extra={<ImportExportSettings />} />}
          {active === "security" && <EditableSettings title="Security settings" description="Safe auth policy statuses and sensitive action protections." fields={settingsFields.security} values={draft} canEdit={canEdit} onChange={updateValue} extra={<SecurityStatus data={data} />} />}
          {active === "health" && <SystemHealth data={data} onRefresh={() => { refetch(); setToast("Health status refreshed."); }} />}
          {active === "audit" && <EditableSettings title="Audit log settings" description="Control which operational events are tracked in the CRM activity history." fields={settingsFields.audit} values={draft} canEdit={canEdit} onChange={updateValue} extra={<AuditLogPreview logs={data.auditLogs} />} />}
        </main>
      </section>
      {dirty && <div className="save-bar"><span>Unsaved settings changes</span><button className="ghost" onClick={() => setDraft(data.values)} disabled={saving}>Reset</button><button className="primary small" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button></div>}
      {confirm && <SettingsConfirmDialog title={confirm.title} body={confirm.body} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm.action; setConfirm(null); action(); }} />}
    </>
  );
}

function SettingsGeneral({ data, auth, onLock, onSignOut }: { data: SettingsResponse; auth: AuthState; onLock: () => void; onSignOut: () => void }) {
  return <div className="settings-stack"><SettingCard title="Account" description="Current signed-in profile and account context."><div className="settings-grid">{Object.entries(data.general).map(([key, value]) => <SettingRow key={key} label={titleCase(key.replace(/([A-Z])/g, " $1"))} value={String(value)} />)}<SettingRow label="Keep signed in" value={auth.session?.keepSignedIn ? "Enabled" : "Default session"} /></div><div className="settings-actions"><button className="ghost" onClick={onLock}>Logout from current profile</button><button className="ghost" onClick={onSignOut}>Sign out from account</button></div></SettingCard><SettingCard title="Profile security" description="Profile password changes use the existing reset OTP flow."><div className="settings-actions"><Link className="primary small" to="/profiles">Change profile password</Link></div></SettingCard>{!data.isAdmin && <AccessNote />}</div>;
}

function EditableSettings({ title, description, fields, values, canEdit, onChange, extra }: { title: string; description: string; fields: SettingsField[]; values: Record<string, string | number | boolean>; canEdit: boolean; onChange: (key: string, value: string | number | boolean) => void; extra?: ReactNode }) {
  return <div className="settings-stack"><SettingCard title={title} description={description}><div className="settings-grid">{fields.map((field) => <SettingsInput key={field.key} field={field} value={values[field.key]} disabled={!canEdit} onChange={onChange} />)}</div>{!canEdit && <AccessNote />}</SettingCard>{extra}</div>;
}

function SettingsInput({ field, value, disabled, onChange }: { field: SettingsField; value: string | number | boolean; disabled: boolean; onChange: (key: string, value: string | number | boolean) => void }) {
  if (field.type === "toggle") return <div className="setting-row"><div><b>{field.label}</b><span>{Boolean(value) ? "Enabled" : "Disabled"}</span></div><button className={`switch ${value ? "on" : ""}`} disabled={disabled} onClick={() => onChange(field.key, !value)} type="button"><span /></button></div>;
  if (field.type === "select") return <label className="setting-input"><span>{field.label}</span><select value={String(value ?? "")} disabled={disabled} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(field.key, event.target.value)}>{field.options?.map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}</select></label>;
  return <label className="setting-input"><span>{field.label}</span><input type={field.type} value={String(value ?? "")} disabled={disabled} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(field.key, field.type === "number" ? Number(event.target.value) : event.target.value)} /></label>;
}

function SettingCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="setting-card"><div className="setting-card-head"><div><h3>{title}</h3>{description && <p>{description}</p>}</div></div>{children}</section>;
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return <div className="setting-row"><div><b>{label}</b><span>{value}</span></div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = normalized.includes("connected") || normalized.includes("configured") || normalized.includes("production") ? "ready" : normalized.includes("missing") || normalized.includes("failed") ? "missing" : "warning";
  return <span className={`status-badge ${tone}`}>{status}</span>;
}

function AccessNote() {
  return <div className="access-note">Limited access. Only the nesma admin profile can change admin settings.</div>;
}

function ListCard({ title, lists }: { title: string; lists: [string, string[]][] }) {
  return <SettingCard title={title}>{lists.map(([label, items]) => <div className="list-row" key={label}><b>{label}</b><div>{items.map((item) => <span key={item}>{item}</span>)}</div></div>)}</SettingCard>;
}

function ProfilesSettings({ data }: { data: SettingsResponse }) {
  return <div className="settings-stack"><SettingCard title="Profile management" description="Admin overview of profiles, work ownership, and actions."><div className="settings-actions"><button className="primary small">Create profile</button><button className="ghost">Transfer work</button></div><div className="profile-settings-table">{data.profiles.map((profile) => <div className="profile-settings-row" key={profile.id}><b>{profile.name}</b><span>{profile.role}</span><span>{profile.status}</span><span>{profile.lastActivity}</span><span>{profile.leads} leads</span><span>{profile.bookings} bookings</span><div><button className="ghost">Edit</button><button className="ghost">Reset</button></div></div>)}</div></SettingCard><PermissionMatrix roles={data.lists.roles} permissions={data.lists.permissions} /></div>;
}

function PermissionMatrix({ roles, permissions }: { roles: string[]; permissions: string[] }) {
  return <SettingCard title="Permission matrix" description="Role capability overview for CRM modules."><div className="permission-grid"><div />{roles.map((role) => <b key={role}>{role}</b>)}{permissions.map((permission) => <div className="permission-row" key={permission}><span>{permission}</span>{roles.map((role) => <span className={role === "Admin" || (role === "Manager" && !permission.toLowerCase().includes("profiles")) ? "allowed" : ""} key={`${permission}-${role}`}>{role === "Viewer" ? "-" : "Yes"}</span>)}</div>)}</div></SettingCard>;
}

function AiStatus({ data }: { data: SettingsResponse }) {
  return <SettingCard title="AI connection" description="Safe status only. API keys are never displayed."><div className="health-grid"><HealthStatusCard name="AI Provider" status={data.safeConfig.aiKey === "Configured" ? "Connected" : "Missing"} detail={`Provider: ${data.safeConfig.aiProvider}`} /><HealthStatusCard name="API Key" status={String(data.safeConfig.aiKey)} detail="Secret value hidden." /><HealthStatusCard name="Model" status="Configured" detail={String(data.safeConfig.aiModel)} /></div></SettingCard>;
}

function EmailSettings({ data }: { data: SettingsResponse }) {
  return <div className="settings-stack"><SettingCard title="Email & OTP" description="OTP policy and safe Resend status."><div className="settings-grid"><SettingRow label="OTP sender email" value={String(data.safeConfig.otpSender)} /><SettingRow label="OTP expiry time" value={String(data.safeConfig.otpExpiry)} /><SettingRow label="OTP resend cooldown" value={String(data.safeConfig.otpResendCooldown)} /><SettingRow label="Maximum OTP attempts" value={String(data.safeConfig.maxOtpAttempts)} /><SettingRow label="Allowed login domain" value={String(data.safeConfig.allowedDomain)} /><div className="setting-row"><div><b>Resend</b><span>Secret key hidden</span></div><StatusBadge status={String(data.safeConfig.resend)} /></div></div></SettingCard></div>;
}

function ImportExportSettings() {
  return <SettingCard title="Data movement" description="Existing import/export tools remain in the Import / Export module."><div className="settings-actions"><Link className="ghost" to="/import-export">Open import/export</Link><a className="ghost" href="/api/export/leads?format=csv">Export leads</a><a className="ghost" href="/api/export/bookings?format=csv">Export bookings</a><a className="ghost" href="/api/export/payments?format=csv">Export payments</a></div></SettingCard>;
}

function SecurityStatus({ data }: { data: SettingsResponse }) {
  return <SettingCard title="Safe security status" description="Sensitive keys and database URLs are never exposed."><div className="health-grid"><HealthStatusCard name="Allowed email domain" status="Configured" detail={String(data.safeConfig.allowedDomain)} /><HealthStatusCard name="Session secret" status={String(data.safeConfig.sessionSecret)} detail="Secret value hidden." /><HealthStatusCard name="OTP rate limit" status="Configured" detail="3 requests per 15 minutes." /></div></SettingCard>;
}

function SystemHealth({ data, onRefresh }: { data: SettingsResponse; onRefresh: () => void }) {
  return <div className="settings-stack"><SettingCard title="System health" description={`Last checked: ${new Date().toLocaleString()}`}><div className="settings-actions"><button className="primary small" onClick={onRefresh}>Refresh health check</button><button className="ghost" onClick={onRefresh}>Test AI</button><button className="ghost" onClick={onRefresh}>Test Resend</button><button className="ghost" onClick={onRefresh}>Test Storage</button></div><div className="health-grid">{data.health.map((item) => <HealthStatusCard key={item.name} {...item} />)}</div></SettingCard></div>;
}

function HealthStatusCard({ name, status, detail }: { name: string; status: string; detail: string }) {
  return <div className="health-card"><div><b>{name}</b><p>{detail}</p></div><StatusBadge status={status} /></div>;
}

function AuditLogPreview({ logs }: { logs: SettingsResponse["auditLogs"] }) {
  return <SettingCard title="Recent audit log preview">{logs.length ? logs.map((log) => <div className="audit-preview-row" key={`${log.action}-${log.date}-${log.details}`}><b>{log.action}</b><span>{log.profile}</span><span>{log.entity}</span><span>{log.date}</span><p>{log.details}</p></div>) : <p className="empty">No audit logs yet.</p>}</SettingCard>;
}

function LogoUploadStub() {
  return <SettingCard title="Logo" description="Current logo preview. Upload can be connected to the existing file storage flow later."><div className="logo-preview"><img src="/onboard-logo-transparent.png" alt="Onboard Tours" /></div></SettingCard>;
}

function SettingsConfirmDialog({ title, body, onCancel, onConfirm }: { title: string; body: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop"><div className="confirm-dialog"><h3>{title}</h3><p>{body}</p><div><button className="ghost" onClick={onCancel}>Cancel</button><button className="primary small" onClick={onConfirm}>Confirm</button></div></div></div>;
}

function Loading() {
  return <div className="loading"><div /><div /><div /></div>;
}
