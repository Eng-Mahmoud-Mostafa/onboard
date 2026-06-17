import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BarChart3, Building2, CalendarCheck, CircleDollarSign, ClipboardList, History, LayoutDashboard, LogOut, Mail, PackageOpen, Plane, Search, Settings, ShieldCheck, Upload, Users } from "lucide-react";
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
type DetailResponse = {
  title: string;
  subtitle: string;
  status: string;
  fields: [string, string | number][];
  related: Record<string, { title: string; meta: string }[]>;
  activity: { message: string; profile: string; date: string }[];
};

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Main" },
  { href: "/leads", label: "Leads", icon: ClipboardList, group: "Main" },
  { href: "/clients", label: "Clients", icon: Users, group: "Main" },
  { href: "/companies", label: "Agencies", icon: Building2, group: "Main" },
  { href: "/packages", label: "Packages", icon: PackageOpen, group: "Main" },
  { href: "/bookings", label: "Bookings", icon: Plane, group: "Main" },
  { href: "/payments", label: "Payments", icon: CircleDollarSign, group: "Main" },
  { href: "/tasks", label: "Tasks", icon: CalendarCheck, group: "Main" },
  { href: "/reports", label: "Reports", icon: BarChart3, group: "Admin", admin: true },
  { href: "/import-export", label: "Import / Export", icon: Upload, group: "Admin", admin: true },
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
  const [error, setError] = useState("");
  if (auth.profile) return <Navigate to="/dashboard" replace />;
  if (auth.session) return <Navigate to="/profiles" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await postJson<{ next: string }>("/api/auth/request-otp", { email });
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
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await postJson<{ next: string }>("/api/auth/verify", { email, otp });
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
            <Route path="/activity" element={<ResourcePage resource="activity" profile={profile} />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/import-export" element={<ImportExportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(`/api/import/${type}`, { method: "POST", body: form });
    onDone();
  }
  return <form onSubmit={submit} className="import"><input name="file" type="file" accept=".xlsx,.xls,.csv" /><button className="ghost"><Upload size={14} /> Import</button></form>;
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

function SettingsPage() {
  return <><PageHeader title="Settings" description="Environment and integration health." /><div className="settings"><div>Supabase Postgres</div><b>Connected through Prisma</b><div>Resend</div><b>OTP email enabled</b><div>Runtime</div><b>Vite React + Express API</b></div></>;
}

function Loading() {
  return <div className="loading"><div /><div /><div /></div>;
}
