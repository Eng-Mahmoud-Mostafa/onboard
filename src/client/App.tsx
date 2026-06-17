import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { BarChart3, CalendarCheck, CircleDollarSign, ClipboardList, History, LayoutDashboard, LogOut, Mail, PackageOpen, Plane, Search, Settings, ShieldCheck, Upload, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, AuthState, postJson } from "./api";

type Profile = { id: string; name: string; isAdmin: boolean };
type Lookup = { profiles: { id: string; name: string }[]; clients: { id: string; fullName: string }[]; packages: { id: string; name: string }[]; bookings: { id: string; bookingCode: string }[] };
type Dashboard = {
  stats: { label: string; value: string | number; hint: string }[];
  profiles: Record<string, unknown>[];
  upcoming: { title: string; due: string; profile: string }[];
  activity: { message: string; date: string; profile: string }[];
  isAdmin: boolean;
};
type ResourceResponse = { rows: Record<string, unknown>[]; total: number; page: number; pageCount: number };

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Main" },
  { href: "/leads", label: "Leads", icon: ClipboardList, group: "Main" },
  { href: "/clients", label: "Clients", icon: Users, group: "Main" },
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
  clients: { title: "Clients", description: "All passenger and customer records.", headers: ["Name", "Phone", "Email", "Bookings", "Paid", "Remaining"], labels: ["name", "phone", "email", "bookings", "paid", "remaining"] },
  packages: { title: "Packages", description: "Tour products, destinations, pricing, capacity, and availability.", headers: ["Name", "Destination", "Duration", "Price", "Capacity", "Status"], labels: ["name", "destination", "duration", "price", "capacity", "status"] },
  bookings: { title: "Bookings", description: "Confirmed and pending travel bookings with balances.", headers: ["Code", "Client", "Package", "Travel", "Total", "Paid", "Remaining", "Status", "Profile"], labels: ["code", "client", "package", "travel", "total", "paid", "remaining", "status", "profile"] },
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
            <Route path="/leads" element={<ResourcePage resource="leads" />} />
            <Route path="/clients" element={<ResourcePage resource="clients" />} />
            <Route path="/packages" element={<ResourcePage resource="packages" />} />
            <Route path="/bookings" element={<ResourcePage resource="bookings" />} />
            <Route path="/payments" element={<ResourcePage resource="payments" />} />
            <Route path="/tasks" element={<ResourcePage resource="tasks" />} />
            <Route path="/activity" element={<ResourcePage resource="activity" />} />
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
      {data.isAdmin && <DataTable headers={["Profile", "Role", "Leads", "Open tasks", "Bookings", "Revenue", "Conversion"]} labels={["profile", "role", "leads", "openTasks", "bookings", "revenue", "conversion"]} rows={data.profiles} />}
      <section className="two-col">
        <div className="card"><h3>Upcoming tasks</h3>{data.upcoming.map((task, index) => <div className="mini-row" key={index}><b>{task.title}</b><span>{task.due} - {task.profile}</span></div>)}</div>
        <div className="card"><h3>Recent activity</h3>{data.activity.map((item, index) => <div className="mini-row active" key={index}><b>{item.message}</b><span>{item.profile} - {item.date}</span></div>)}</div>
      </section>
    </>
  );
}

function ResourcePage({ resource }: { resource: keyof typeof resourceConfig }) {
  const config = resourceConfig[resource];
  const [q, setQ] = useState("");
  const [refresh, setRefresh] = useState(0);
  const debounced = useDebouncedValue(q, 350);
  const { data: rows, isLoading, error } = useQuery({ queryKey: [resource, debounced, refresh], queryFn: () => api<ResourceResponse>(`/api/${resource}?q=${encodeURIComponent(debounced)}`) });
  const canCreate = resource !== "activity";
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <PageHeader title={config.title} description={config.description} action={canCreate ? <CreateDrawer resource={resource} onDone={() => setRefresh((x) => x + 1)} /> : undefined} />
      <div className="toolbar"><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search..." />{resource === "leads" || resource === "tasks" ? <ImportExcel type={resource} onDone={() => setRefresh((x) => x + 1)} /> : null}</div>
      {rows && !isLoading ? <><DataTable headers={config.headers} labels={config.labels} rows={rows.rows} /><PaginationMeta rows={rows} /></> : <Loading />}
    </>
  );
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

function DataTable({ headers, labels, rows }: { headers: readonly string[]; labels: readonly string[]; rows: Record<string, unknown>[] }) {
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{labels.map((label) => <td key={label}>{renderCell(label, row[label])}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="empty">No records yet.</p>}</div>;
}

function renderCell(label: string, value: unknown) {
  const text = String(value ?? "-");
  if (["status", "source", "priority", "method", "role"].includes(label)) return <span className={`chip ${chipClass(text)}`}>{text}</span>;
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
  return <>{<button className="primary small" onClick={() => setOpen(true)}>Add {resource.slice(0, -1)}</button>}{open && <RecordForm resource={resource} onClose={() => setOpen(false)} onDone={onDone} />}</>;
}

function RecordForm({ resource, onClose, onDone }: { resource: string; onClose: () => void; onDone: () => void }) {
  const [lookups, setLookups] = useState<Lookup | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<Lookup>("/api/lookups").then(setLookups); }, []);
  const fields = useMemo(() => formFields(resource, lookups), [resource, lookups]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      await postJson(`/api/crm/${resource}`, payload);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }
  return <div className="modal"><form className="drawer" onSubmit={submit}><h3>Add {resource.slice(0, -1)}</h3>{fields.map((field) => <Field key={field.name} {...field} />)}{error && <p className="error">{error}</p>}<div className="button-row"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary">Save</button></div></form></div>;
}

function Field(field: { name: string; label: string; type?: string; options?: { value: string; label: string }[]; required?: boolean; defaultValue?: string | number; placeholder?: string }) {
  if (field.options) return <label>{field.label}<select name={field.name} required={field.required}>{!field.required && <option value="">Not set</option>}{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  return <label>{field.label}<input name={field.name} type={field.type ?? "text"} required={field.required} defaultValue={field.defaultValue} placeholder={field.placeholder} /></label>;
}

function formFields(resource: string, lookups: Lookup | null) {
  const profileOptions = (lookups?.profiles ?? []).map((p) => ({ value: p.id, label: p.name }));
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
  if (resource === "clients") return [{ name: "fullName", label: "Full name" }, { name: "phone", label: "Phone" }, { name: "email", label: "Email", type: "email" }, { name: "nationality", label: "Nationality" }, { name: "passportNumber", label: "Passport number" }];
  if (resource === "packages") return [{ name: "name", label: "Name" }, { name: "destination", label: "Destination" }, { name: "duration", label: "Duration" }, { name: "price", label: "Price", type: "number" }, { name: "description", label: "Description" }, { name: "includedServices", label: "Included services" }, { name: "excludedServices", label: "Excluded services" }, { name: "capacity", label: "Capacity", type: "number" }, { name: "status", label: "Status", options: ["ACTIVE", "DRAFT", "ARCHIVED"].map((x) => ({ value: x, label: x })) }];
  if (resource === "tasks") return [{ name: "title", label: "Task title" }, { name: "description", label: "Description" }, { name: "dueAt", label: "Due date", type: "datetime-local" }, { name: "priority", label: "Priority", options: ["LOW", "MEDIUM", "HIGH"].map((x) => ({ value: x, label: x })) }, { name: "assignedProfileId", label: "Assigned profile", options: profileOptions }];
  if (resource === "bookings") return [{ name: "clientId", label: "Client", options: (lookups?.clients ?? []).map((x) => ({ value: x.id, label: x.fullName })) }, { name: "packageId", label: "Package", options: (lookups?.packages ?? []).map((x) => ({ value: x.id, label: x.name })) }, { name: "travelDate", label: "Travel date", type: "date" }, { name: "travelers", label: "Travelers", type: "number" }, { name: "totalPrice", label: "Total price", type: "number" }, { name: "paidAmount", label: "Paid amount", type: "number" }, { name: "bookingStatus", label: "Status", options: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"].map((x) => ({ value: x, label: x })) }, { name: "assignedProfileId", label: "Assigned profile", options: profileOptions }];
  if (resource === "payments") return [{ name: "bookingId", label: "Booking", options: (lookups?.bookings ?? []).map((x) => ({ value: x.id, label: x.bookingCode })) }, { name: "amountPaid", label: "Amount", type: "number" }, { name: "paymentMethod", label: "Method", options: ["CASH", "BANK_TRANSFER", "INSTAPAY", "VODAFONE_CASH", "CARD", "OTHER"].map((x) => ({ value: x, label: x })) }, { name: "paymentDate", label: "Date", type: "date" }];
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
          <div className="export-buttons">{["leads", "clients", "bookings", "payments", "reports"].map((type) => <a className="ghost" href={`/api/export/${type}?format=csv`} key={type}>Export {type}</a>)}</div>
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
