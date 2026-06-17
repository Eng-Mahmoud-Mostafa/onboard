import "./env";
import crypto from "crypto";
import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import ExcelJS from "exceljs";
import { BookingStatus, LeadSource, LeadStatus, PaymentStatus, TaskPriority, TaskStatus } from "@prisma/client";
import { getPrisma } from "./db";
import { assignedFilter, allowedDomain, clearAuth, compareHash, getSession, getUnlockedProfile, hashValue, isAllowedEmail, recordedFilter, requireAdmin, requireProfile, requireSession, setProfile, setSession, visibleProfiles } from "./auth";
import { sendOtpEmail, sendProfileResetOtpEmail } from "./email";
import { bookingSchema, clientSchema, companySchema, leadSchema, packageSchema, paymentSchema, profileSchema, requestOtpSchema, taskSchema, verifyOtpSchema } from "./validators";
import { enumLabel, money, shortDate } from "./format";
import { getSupabase, storageBucket } from "./storage";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(express.json());
app.use(cookieParser());

function asyncRoute(fn: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function clean<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, entry === "" ? undefined : entry])) as T;
}

function pageParams(req: express.Request) {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize ?? 20), 1), 50);
  const q = String(req.query.q ?? "").trim();
  return { page, pageSize, q, skip: (page - 1) * pageSize };
}

function paged(res: express.Response, rows: Record<string, unknown>[], total: number, page: number, pageSize: number) {
  res.json({ rows, total, page, pageSize, pageCount: Math.max(Math.ceil(total / pageSize), 1) });
}

function csvValue(value: unknown) {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function sendCsv(res: express.Response, fileName: string, rows: Record<string, unknown>[]) {
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(csv);
}

function checklistStatus(ok: boolean, warning = false) {
  if (ok) return "ready";
  return warning ? "warning" : "missing";
}

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

function deploymentItem(section: string, label: string, ok: boolean, detail: string, warning = false) {
  return { section, label, status: checklistStatus(ok, warning), detail };
}

function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

type AiSupportMessageInput = {
  role?: string;
  text?: unknown;
};

function timelineDate(value: Date) {
  return value.toISOString();
}

function generateOtp() {
  if (process.env.NODE_ENV !== "production" && process.env.USE_FIXED_DEV_OTP === "true" && process.env.DEV_OTP_CODE) {
    return process.env.DEV_OTP_CODE;
  }
  return crypto.randomInt(100000, 999999).toString();
}

function text(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value) return String(value.text ?? "");
  if (typeof value === "object" && "result" in value) return String(value.result ?? "");
  return String(value).trim();
}

function normalizeHeader(value: unknown) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function enumValue<T extends Record<string, string>>(source: T, value: unknown, fallback: T[keyof T]) {
  const normalized = normalizeHeader(value);
  const match = Object.values(source).find((item) => normalizeHeader(item) === normalized);
  return (match ?? fallback) as T[keyof T];
}

function rowDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function readWorksheetRows(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  const loadWorkbook = workbook.xlsx.load.bind(workbook.xlsx) as (buffer: unknown) => Promise<ExcelJS.Workbook>;
  await loadWorkbook(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The Excel file has no worksheets.");
  const headers = (worksheet.getRow(1).values as unknown[]).slice(1).map((value) => normalizeHeader(value));
  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]).slice(1);
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) record[header] = values[index];
    });
    if (Object.values(record).some((value) => text(value))) rows.push(record);
  });
  return rows;
}

function previewValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return text(value);
}

function importPreviewRow(index: number, status: "valid" | "invalid", issues: string[], preview: Record<string, unknown>) {
  return { row: index + 2, status, issues, preview: Object.fromEntries(Object.entries(preview).map(([key, value]) => [key, previewValue(value)])) };
}

function parseImportRows(type: string, rows: Record<string, unknown>[], profileId: string, profileByName: Map<string, string>) {
  if (type === "leads") {
    const parsed = rows.map((row, index) => {
      const clientName = text(row.clientname ?? row.name ?? row.fullname);
      const phone = text(row.phonenumber ?? row.phone ?? row.mobile);
      const interestedPackage = text(row.interesteddestinationpackage ?? row.interestedpackage ?? row.package ?? row.destination);
      const issues = [!clientName ? "Missing client name" : "", !phone ? "Missing phone" : "", !interestedPackage ? "Missing interested package or destination" : ""].filter(Boolean);
      const data = { clientName, phone, email: text(row.email) || null, source: enumValue(LeadSource, row.source, LeadSource.OTHER), interestedPackage, budget: Number(text(row.budget)) || null, travelDate: rowDate(row.traveldate), travelers: Number(text(row.travelers ?? row.numberoftravelers)) || 1, status: enumValue(LeadStatus, row.status, LeadStatus.NEW), assignedProfileId: profileByName.get(normalizeHeader(row.assignedprofile ?? row.profile)) ?? profileId, notes: text(row.notes) || null };
      return { data, preview: importPreviewRow(index, issues.length ? "invalid" : "valid", issues, { clientName, phone, email: data.email, source: data.source, interestedPackage, travelDate: data.travelDate, travelers: data.travelers, status: data.status }) };
    });
    return { records: parsed.filter((item) => item.preview.status === "valid").map((item) => item.data), previewRows: parsed.map((item) => item.preview) };
  }

  if (type === "tasks") {
    const parsed = rows.map((row, index) => {
      const title = text(row.tasktitle ?? row.title ?? row.task);
      const dueAt = rowDate(row.duedatetime ?? row.dueat ?? row.duedate);
      const issues = [!title ? "Missing task title" : "", !dueAt ? "Missing or invalid due date" : ""].filter(Boolean);
      const data = { title, description: text(row.description) || null, dueAt, priority: enumValue(TaskPriority, row.priority, TaskPriority.MEDIUM), assignedProfileId: profileByName.get(normalizeHeader(row.assignedprofile ?? row.profile)) ?? profileId };
      return { data, preview: importPreviewRow(index, issues.length ? "invalid" : "valid", issues, { title, dueAt, priority: data.priority, assignedProfile: text(row.assignedprofile ?? row.profile) || "Current profile" }) };
    });
    return { records: parsed.filter((item) => item.preview.status === "valid").map((item) => item.data), previewRows: parsed.map((item) => item.preview) };
  }

  if (type === "clients") {
    const parsed = rows.map((row, index) => {
      const fullName = text(row.fullname ?? row.name ?? row.clientname);
      const phone = text(row.phone ?? row.mobile ?? row.phonenumber);
      const issues = [!fullName ? "Missing full name" : "", !phone ? "Missing phone" : ""].filter(Boolean);
      const data = { fullName, phone, email: text(row.email) || null, nationality: text(row.nationality) || null, passportNumber: text(row.passportnumber ?? row.passport) || null, notes: text(row.notes) || null, assignedProfileId: profileId };
      return { data, preview: importPreviewRow(index, issues.length ? "invalid" : "valid", issues, { fullName, phone, email: data.email, nationality: data.nationality, passportNumber: data.passportNumber }) };
    });
    return { records: parsed.filter((item) => item.preview.status === "valid").map((item) => item.data), previewRows: parsed.map((item) => item.preview) };
  }

  return null;
}

app.get("/api/health", (_, res) => res.json({ ok: true, app: "onboard-vite-api" }));

app.get("/api/auth/me", asyncRoute(async (req, res) => {
  res.json({ session: await getSession(req), profile: await getUnlockedProfile(req) });
}));

app.get("/api/auth/session", asyncRoute(async (req, res) => {
  res.json({ session: await getSession(req), profile: await getUnlockedProfile(req) });
}));

app.post("/api/auth/request-otp", asyncRoute(async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid work email." });
  const email = parsed.data.email;
  if (!isAllowedEmail(email)) return res.status(400).json({ error: `Only @${allowedDomain()} email addresses can log in.` });

  const db = getPrisma();
  const recent = await db.otpToken.count({ where: { email, createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } } });
  if (recent >= 3) return res.status(429).json({ error: "Too many login codes requested. Please wait 15 minutes." });

  const otp = generateOtp();
  const user = await db.user.upsert({ where: { email }, update: {}, create: { email } });
  await db.otpToken.create({ data: { email, tokenHash: await hashValue(otp), expiresAt: new Date(Date.now() + 10 * 60 * 1000), userId: user.id } });
  if (!(process.env.NODE_ENV !== "production" && process.env.SKIP_OTP_EMAIL_IN_DEV === "true")) await sendOtpEmail(email, otp);
  res.json({ ok: true, email, next: `/verify?email=${encodeURIComponent(email)}` });
}));

app.post("/api/auth/send-otp", (_req, res) => res.redirect(307, "/api/auth/request-otp"));

app.post("/api/auth/verify", asyncRoute(async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the 6-digit code." });
  const db = getPrisma();
  const token = await db.otpToken.findFirst({ where: { email: parsed.data.email, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!token) return res.status(400).json({ error: "This code expired. Request a new OTP." });
  if (token.attemptCount >= 5) return res.status(429).json({ error: "Too many attempts. Request a new OTP." });

  const matches = await compareHash(parsed.data.otp, token.tokenHash);
  await db.otpToken.update({ where: { id: token.id }, data: { attemptCount: { increment: 1 }, consumedAt: matches ? new Date() : undefined } });
  if (!matches) return res.status(400).json({ error: "Incorrect code. Try again." });

  const user = await db.user.findUniqueOrThrow({ where: { email: parsed.data.email } });
  await setSession(res, { userId: user.id, email: user.email });
  res.json({ ok: true, next: "/profiles" });
}));

app.post("/api/auth/verify-otp", (_req, res) => res.redirect(307, "/api/auth/verify"));

app.post("/api/auth/signout", (_, res) => {
  clearAuth(res);
  res.json({ ok: true });
});

app.post("/api/auth/logout", (_, res) => {
  clearAuth(res);
  res.json({ ok: true });
});

app.post("/api/ai/support", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return res.status(503).json({ error: "Onboard AI is not configured yet. Add GEMINI_API_KEY on the server." });
  const input: AiSupportMessageInput[] = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = input
    .map((message) => ({ role: message?.role === "assistant" || message?.role === "model" ? "model" : "user", text: String(message?.text ?? "").trim() }))
    .filter((message) => message.text)
    .slice(-12);
  if (!messages.length) return res.status(400).json({ error: "Send a message first." });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: `You are Onboard AI, the internal CRM support assistant for Onboard Tours. Help ${profile.profileName} use the CRM, write travel sales follow-ups, explain booking/payment/task workflows, and answer operational questions. Be concise, practical, and do not invent private CRM data that was not provided in the chat.` }],
      },
      contents: messages.map((message) => ({ role: message.role, parts: [{ text: message.text }] })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return res.status(502).json({ error: payload.error?.message ?? "Onboard AI could not answer right now." });
  const text = payload.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  res.json({ message: text || "Onboard AI did not return a response." });
}));

app.get("/api/profiles", asyncRoute(async (req, res) => {
  res.json({ profiles: await visibleProfiles(req), session: await requireSession(req) });
}));

app.post("/api/profiles", asyncRoute(async (req, res) => {
  const session = await requireSession(req);
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Profile name and password are required." });
  const adminName = process.env.ADMIN_PROFILE_NAME ?? "nesma";
  const db = getPrisma();
  const exists = await db.profile.findUnique({ where: { name: parsed.data.name } });
  if (exists) return res.status(409).json({ error: "A profile with that name already exists." });
  await db.profile.create({
    data: {
      name: parsed.data.name,
      passwordHash: await hashValue(parsed.data.password),
      isAdmin: parsed.data.name.toLowerCase() === adminName.toLowerCase(),
      userId: session.userId,
      activityLogs: { create: { action: "PROFILE_CREATED", message: `Profile ${parsed.data.name} was created.` } },
    },
  });
  res.json({ ok: true });
}));

app.post("/api/profiles/unlock", asyncRoute(async (req, res) => {
  await requireSession(req);
  const profile = await getPrisma().profile.findUnique({ where: { id: String(req.body.profileId ?? "") } });
  if (!profile || !(await compareHash(String(req.body.password ?? ""), profile.passwordHash))) return res.status(400).json({ error: "Profile password is incorrect." });
  await setProfile(res, { profileId: profile.id, profileName: profile.name, isAdmin: profile.isAdmin });
  await getPrisma().activityLog.create({ data: { action: "PROFILE_LOGGED_IN", message: `${profile.name} unlocked their CRM workspace.`, profileId: profile.id } });
  res.json({ ok: true, next: "/dashboard" });
}));

app.post("/api/profiles/:id/unlock", asyncRoute(async (req, res) => {
  await requireSession(req);
  const profile = await getPrisma().profile.findUnique({ where: { id: String(req.params.id) } });
  if (!profile || !(await compareHash(String(req.body.password ?? ""), profile.passwordHash))) return res.status(400).json({ error: "Profile password is incorrect." });
  await setProfile(res, { profileId: profile.id, profileName: profile.name, isAdmin: profile.isAdmin });
  await getPrisma().activityLog.create({ data: { action: "PROFILE_LOGGED_IN", message: `${profile.name} unlocked their CRM workspace.`, profileId: profile.id } });
  res.json({ ok: true, next: "/dashboard" });
}));

app.post("/api/profiles/reset/request", asyncRoute(async (req, res) => {
  await requireSession(req);
  const profileId = String(req.body.profileId ?? "");
  const db = getPrisma();
  const profile = await db.profile.findUnique({ where: { id: profileId } });
  if (!profile) return res.status(404).json({ error: "Profile not found." });
  const resetEmail = process.env.PROFILE_RESET_EMAIL ?? "info@onboard-tours.com";
  const otp = generateOtp();
  await db.profilePasswordResetToken.create({ data: { profileId, email: resetEmail, tokenHash: await hashValue(otp), expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
  if (!(process.env.NODE_ENV !== "production" && process.env.SKIP_OTP_EMAIL_IN_DEV === "true")) await sendProfileResetOtpEmail(resetEmail, profile.name, otp);
  res.json({ ok: true, next: `/profiles/reset?profileId=${encodeURIComponent(profileId)}` });
}));

app.post("/api/profiles/reset/confirm", asyncRoute(async (req, res) => {
  await requireSession(req);
  const profileId = String(req.body.profileId ?? "");
  const otp = String(req.body.otp ?? "").trim();
  const password = String(req.body.password ?? "");
  if (!/^\d{6}$/.test(otp) || password.length < 8) return res.status(400).json({ error: "Enter a valid OTP and a password of at least 8 characters." });
  const resetEmail = process.env.PROFILE_RESET_EMAIL ?? "info@onboard-tours.com";
  const db = getPrisma();
  const token = await db.profilePasswordResetToken.findFirst({ where: { profileId, email: resetEmail, consumedAt: null, expiresAt: { gt: new Date() } }, include: { profile: true }, orderBy: { createdAt: "desc" } });
  if (!token) return res.status(400).json({ error: "This reset code expired. Request a new one." });
  const matches = await compareHash(otp, token.tokenHash);
  await db.profilePasswordResetToken.update({ where: { id: token.id }, data: { attemptCount: { increment: 1 }, consumedAt: matches ? new Date() : undefined } });
  if (!matches) return res.status(400).json({ error: "Incorrect reset code. Try again." });
  await db.profile.update({ where: { id: profileId }, data: { passwordHash: await hashValue(password) } });
  await db.activityLog.create({ data: { action: "PROFILE_PASSWORD_RESET", message: `Password reset completed for profile ${token.profile.name}.`, profileId } });
  res.json({ ok: true, next: "/profiles" });
}));

app.get("/api/lookups", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const db = getPrisma();
  const assignedWhere = assignedFilter(profile);
  const [profiles, clients, packages, bookings, companies] = await Promise.all([
    profile.isAdmin ? db.profile.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : db.profile.findMany({ where: { id: profile.profileId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.client.findMany({ where: profile.isAdmin ? {} : { assignedProfileId: profile.profileId }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.package.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.booking.findMany({ where: assignedWhere, select: { id: true, bookingCode: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.company.findMany({ where: { ...assignedWhere, status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  res.json({ profiles, clients, packages, bookings, companies });
}));

app.get("/api/crm/:resource", asyncRoute(async (req, res) => {
  const current = await requireProfile(req);
  const { resource } = req.params;
  const { page, pageSize, q, skip } = pageParams(req);
  const db = getPrisma();

  if (resource === "dashboard") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const filter = assignedFilter(current.profile);
    const [totalLeads, newToday, pendingTasks, confirmedBookings, cancelledBookings, revenue, upcoming, activity, profiles, leadStatus, bookingStatus, taskStatus, revenueRows, packageRows, agencyRows] = await Promise.all([
      db.lead.count({ where: filter }),
      db.lead.count({ where: { ...filter, createdAt: { gte: today } } }),
      db.task.count({ where: { ...filter, status: "PENDING" } }),
      db.booking.count({ where: { ...filter, bookingStatus: "CONFIRMED" } }),
      db.booking.count({ where: { ...filter, bookingStatus: "CANCELLED" } }),
      db.payment.aggregate({ _sum: { amountPaid: true }, where: recordedFilter(current.profile) }),
      db.task.findMany({ where: { ...filter, status: "PENDING" }, include: { assignedProfile: true }, orderBy: { dueAt: "asc" }, take: 8 }),
      db.activityLog.findMany({ where: current.profile.isAdmin ? {} : { profileId: current.profile.profileId }, include: { profile: true }, orderBy: { createdAt: "desc" }, take: 8 }),
      current.profile.isAdmin ? db.profile.findMany({ include: { leads: true, bookings: true, tasks: true, payments: true }, orderBy: [{ isAdmin: "desc" }, { name: "asc" }] }) : db.profile.findMany({ where: { id: current.profile.profileId }, include: { leads: true, bookings: true, tasks: true, payments: true } }),
      db.lead.groupBy({ by: ["status"], _count: true, where: filter }),
      db.booking.groupBy({ by: ["bookingStatus"], _count: true, where: filter }),
      db.task.groupBy({ by: ["status"], _count: true, where: filter }),
      db.payment.groupBy({ by: ["recordedById"], _sum: { amountPaid: true }, where: recordedFilter(current.profile) }),
      db.booking.groupBy({ by: ["packageNameSnapshot"], _count: true, where: filter, orderBy: { _count: { packageNameSnapshot: "desc" } }, take: 5 }),
      db.booking.groupBy({ by: ["companyId"], _count: true, where: { ...filter, companyId: { not: null } }, orderBy: { _count: { companyId: "desc" } }, take: 5 }),
    ]);
    const profileNameById = new Map(profiles.map((item) => [item.id, item.name]));
    const agencyNames = agencyRows.length ? await db.company.findMany({ where: { id: { in: agencyRows.map((row) => row.companyId).filter((id): id is string => Boolean(id)) } }, select: { id: true, name: true } }) : [];
    const agencyNameById = new Map(agencyNames.map((item) => [item.id, item.name]));
    return res.json({
      stats: [
        { label: "Total leads", value: totalLeads, hint: "Visible leads" },
        { label: "New today", value: newToday, hint: "Fresh inquiries" },
        { label: "Pending tasks", value: pendingTasks, hint: "Open follow-ups" },
        { label: "Confirmed", value: confirmedBookings, hint: "Ready trips" },
        { label: "Cancelled", value: cancelledBookings, hint: "Lost bookings" },
        { label: "Revenue", value: money(revenue._sum.amountPaid?.toString()), hint: "Recorded payments" },
      ],
      upcoming: upcoming.map((task) => ({ title: task.title, profile: task.assignedProfile?.name ?? "Unassigned", due: shortDate(task.dueAt) })),
      activity: activity.map((item) => ({ message: item.message, profile: item.profile?.name ?? "-", date: shortDate(item.createdAt) })),
      profiles: profiles.map((item) => ({ profile: item.name, role: item.isAdmin ? "Admin" : "Employee", leads: item.leads.length, openTasks: item.tasks.filter((task) => task.status === "PENDING").length, bookings: item.bookings.length, revenue: money(item.payments.reduce((sum, payment) => sum + Number(payment.amountPaid), 0)), conversion: item.leads.length ? `${Math.round((item.leads.filter((lead) => lead.status === "CONVERTED").length / item.leads.length) * 100)}%` : "0%" })),
      charts: {
        leadStatus: Object.values(LeadStatus).map((status) => ({ label: enumLabel(status), value: leadStatus.find((row) => row.status === status)?._count ?? 0 })),
        bookingStatus: Object.values(BookingStatus).map((status) => ({ label: enumLabel(status), value: bookingStatus.find((row) => row.bookingStatus === status)?._count ?? 0 })),
        taskStatus: Object.values(TaskStatus).map((status) => ({ label: enumLabel(status), value: taskStatus.find((row) => row.status === status)?._count ?? 0 })),
        revenueByProfile: revenueRows.map((row) => ({ label: row.recordedById ? profileNameById.get(row.recordedById) ?? "Unassigned" : "Unassigned", value: Number(row._sum.amountPaid ?? 0) })).sort((a, b) => b.value - a.value),
        topPackages: packageRows.map((row) => ({ label: row.packageNameSnapshot ?? "Custom trip", value: row._count })),
        agencyBookings: agencyRows.map((row) => ({ label: row.companyId ? agencyNameById.get(row.companyId) ?? "Agency" : "Direct", value: row._count })),
      },
      isAdmin: current.profile.isAdmin,
    });
  }

  if (resource === "leads") {
    const where = { ...assignedFilter(current.profile), ...(q ? { OR: [{ clientName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}) };
    const [rows, total] = await Promise.all([db.lead.findMany({ where, include: { assignedProfile: true }, orderBy: { updatedAt: "desc" }, skip, take: pageSize }), db.lead.count({ where })]);
    return paged(res, rows.map((lead) => ({ id: lead.id, clientName: lead.clientName, client: lead.clientName, phone: lead.phone, email: lead.email ?? "", source: lead.source, interestedDestination: lead.interestedDestination ?? "", interestedPackage: lead.interestedPackage, budget: lead.budget?.toString() ?? "", travelDate: lead.travelDate ? lead.travelDate.toISOString().slice(0, 10) : "", travelers: lead.travelers, status: lead.status, assignedProfileId: lead.assignedProfileId ?? "", notes: lead.notes ?? "", profile: lead.assignedProfile?.name ?? "Unassigned", travel: shortDate(lead.travelDate), updated: shortDate(lead.updatedAt) })), total, page, pageSize);
  }

  if (resource === "clients") {
    const where = { ...assignedFilter(current.profile), ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}) };
    const [rows, total] = await Promise.all([db.client.findMany({ where, include: { company: true, bookings: true }, orderBy: { updatedAt: "desc" }, skip, take: pageSize }), db.client.count({ where })]);
    return paged(res, rows.map((client) => ({ id: client.id, fullName: client.fullName, name: client.fullName, phone: client.phone, email: client.email ?? "", nationality: client.nationality ?? "", passportNumber: client.passportNumber ?? "", companyId: client.companyId ?? "", company: client.company?.name ?? "-", notes: client.notes ?? "", assignedProfileId: client.assignedProfileId ?? "", bookings: client.bookings.length, paid: money(client.bookings.reduce((sum, booking) => sum + Number(booking.paidAmount), 0)), remaining: money(client.bookings.reduce((sum, booking) => sum + Number(booking.remainingAmount), 0)) })), total, page, pageSize);
  }

  if (resource === "companies") {
    const where = { ...assignedFilter(current.profile), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { contactPerson: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}) };
    const [rows, total] = await Promise.all([db.company.findMany({ where, include: { assignedProfile: true, clients: true, bookings: true }, orderBy: { updatedAt: "desc" }, skip, take: pageSize }), db.company.count({ where })]);
    return paged(res, rows.map((company) => ({ id: company.id, name: company.name, type: company.type, status: company.status, contactPerson: company.contactPerson ?? "", phone: company.phone ?? "", email: company.email ?? "", address: company.address ?? "", taxId: company.taxId ?? "", commissionPercent: company.commissionPercent?.toString() ?? "", commission: company.commissionPercent == null ? "-" : `${company.commissionPercent}%`, assignedProfileId: company.assignedProfileId ?? "", profile: company.assignedProfile?.name ?? "Unassigned", notes: company.notes ?? "", clients: company.clients.length, bookings: company.bookings.length })), total, page, pageSize);
  }

  if (resource === "packages") {
    const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { destination: { contains: q, mode: "insensitive" as const } }] } : {};
    const [rows, total] = await Promise.all([db.package.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize }), db.package.count({ where })]);
    return paged(res, rows.map((item) => ({ id: item.id, name: item.name, destination: item.destination, duration: item.duration, rawPrice: item.price.toString(), price: money(item.price.toString()), description: item.description, includedServices: item.includedServices, excludedServices: item.excludedServices, capacity: item.capacity, status: item.status })), total, page, pageSize);
  }

  if (resource === "bookings") {
    const where = { ...assignedFilter(current.profile), ...(q ? { OR: [{ bookingCode: { contains: q, mode: "insensitive" as const } }, { client: { fullName: { contains: q, mode: "insensitive" as const } } }, { package: { name: { contains: q, mode: "insensitive" as const } } }] } : {}) };
    const [rows, total] = await Promise.all([db.booking.findMany({ where, include: { client: true, company: true, package: true, assignedProfile: true }, orderBy: { createdAt: "desc" }, skip, take: pageSize }), db.booking.count({ where })]);
    return paged(res, rows.map((booking) => ({ id: booking.id, code: booking.bookingCode, clientId: booking.clientId, client: booking.client.fullName, companyId: booking.companyId ?? "", company: booking.company?.name ?? "-", packageId: booking.packageId ?? "", package: booking.package?.name ?? booking.packageNameSnapshot ?? "Custom trip", travelDate: booking.travelDate.toISOString().slice(0, 10), travel: shortDate(booking.travelDate), travelers: booking.travelers, totalPrice: booking.totalPrice.toString(), paidAmount: booking.paidAmount.toString(), total: money(booking.totalPrice.toString()), paid: money(booking.paidAmount.toString()), remaining: money(booking.remainingAmount.toString()), bookingStatus: booking.bookingStatus, status: enumLabel(booking.bookingStatus), assignedProfileId: booking.assignedProfileId ?? "", profile: booking.assignedProfile?.name ?? "Unassigned", notes: booking.notes ?? "" })), total, page, pageSize);
  }

  if (resource === "payments") {
    const where = { ...recordedFilter(current.profile), ...(q ? { OR: [{ clientName: { contains: q, mode: "insensitive" as const } }, { booking: { bookingCode: { contains: q, mode: "insensitive" as const } } }] } : {}) };
    const [rows, total] = await Promise.all([db.payment.findMany({ where, include: { booking: true, recordedBy: true }, orderBy: { paymentDate: "desc" }, skip, take: pageSize }), db.payment.count({ where })]);
    return paged(res, rows.map((payment) => ({ id: payment.id, bookingId: payment.bookingId, booking: payment.booking.bookingCode, client: payment.clientName, amountPaid: payment.amountPaid.toString(), amount: money(payment.amountPaid.toString()), paymentMethod: payment.paymentMethod, method: enumLabel(payment.paymentMethod), paymentDate: payment.paymentDate.toISOString().slice(0, 10), date: shortDate(payment.paymentDate), notes: payment.notes ?? "", recordedById: payment.recordedById ?? "", profile: payment.recordedBy?.name ?? "-" })), total, page, pageSize);
  }

  if (resource === "tasks") {
    const where = { ...assignedFilter(current.profile), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}) };
    const [rows, total] = await Promise.all([db.task.findMany({ where, include: { assignedProfile: true }, orderBy: { dueAt: "asc" }, skip, take: pageSize }), db.task.count({ where })]);
    return paged(res, rows.map((task) => ({ id: task.id, title: task.title, task: task.title, description: task.description ?? "", dueAt: task.dueAt.toISOString().slice(0, 16), due: shortDate(task.dueAt), priority: task.priority, status: task.status, assignedProfileId: task.assignedProfileId ?? "", profile: task.assignedProfile?.name ?? "Unassigned" })), total, page, pageSize);
  }

  if (resource === "activity") {
    const where = current.profile.isAdmin ? {} : { profileId: current.profile.profileId };
    const [rows, total] = await Promise.all([db.activityLog.findMany({ where, include: { profile: true }, orderBy: { createdAt: "desc" }, skip, take: pageSize }), db.activityLog.count({ where })]);
    return paged(res, rows.map((item) => ({ action: enumLabel(item.action), message: item.message, profile: item.profile?.name ?? "-", date: shortDate(item.createdAt) })), total, page, pageSize);
  }

  return res.status(404).json({ error: "Unknown resource" });
}));

app.post("/api/crm/:resource", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const db = getPrisma();
  const resource = req.params.resource;

  if (resource === "leads") {
    const parsed = leadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: `Check the lead fields: ${parsed.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", ")}.` });
    const input = clean(parsed.data);
    await db.lead.create({ data: { clientName: input.clientName, phone: input.phone, email: input.email || null, source: input.source, interestedDestination: input.interestedDestination || null, interestedPackage: input.interestedPackage, budget: input.budget, travelDate: input.travelDate ? new Date(input.travelDate) : null, travelers: input.travelers, travelersCount: input.travelers, status: input.status, assignedProfileId: profile.isAdmin ? input.assignedProfileId || profile.profileId : profile.profileId, notes: input.notes || null, activityLogs: { create: { action: "LEAD_CREATED", message: `Lead created for ${input.clientName}.`, profileId: profile.profileId } } } });
  } else if (resource === "clients") {
    const parsed = clientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the client fields and try again." });
    const input = clean(parsed.data);
    if (input.companyId) {
      const company = await db.company.findUnique({ where: { id: input.companyId } });
      if (!company || (!profile.isAdmin && company.assignedProfileId !== profile.profileId)) return res.status(403).json({ error: "You can only assign clients to your agencies." });
    }
    await db.client.create({ data: { fullName: input.fullName, phone: input.phone, email: input.email || null, nationality: input.nationality || null, passportNumber: input.passportNumber || null, companyId: input.companyId || null, notes: input.notes || null, assignedProfileId: profile.profileId, activityLogs: { create: { action: "CLIENT_CREATED", message: `Client ${input.fullName} was added.`, profileId: profile.profileId } } } });
  } else if (resource === "companies") {
    const parsed = companySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the agency fields and try again." });
    const input = clean(parsed.data);
    const company = await db.company.create({ data: { name: input.name, type: input.type, status: input.status, contactPerson: input.contactPerson || null, phone: input.phone || null, email: input.email || null, address: input.address || null, taxId: input.taxId || null, commissionPercent: input.commissionPercent, assignedProfileId: profile.isAdmin ? input.assignedProfileId || profile.profileId : profile.profileId, notes: input.notes || null } });
    await db.activityLog.create({ data: { action: "COMPANY_CREATED", message: `Agency added: ${company.name}.`, profileId: profile.profileId, companyId: company.id } });
  } else if (resource === "packages") {
    if (!profile.isAdmin) return res.status(403).json({ error: "Only admin profiles can manage packages." });
    const parsed = packageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the package fields and try again." });
    const input = parsed.data;
    const item = await db.package.create({ data: { name: input.name, destination: input.destination, duration: input.duration, price: input.price, description: input.description, includedServices: input.includedServices, excludedServices: input.excludedServices, capacity: input.capacity, status: input.status, availableDates: [] } });
    await db.activityLog.create({ data: { action: "PACKAGE_CREATED", message: `Package created: ${item.name}`, profileId: profile.profileId } });
  } else if (resource === "tasks") {
    const parsed = taskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the task fields and try again." });
    const input = clean(parsed.data);
    const dueAt = new Date(input.dueAt);
    const task = await db.task.create({ data: { title: input.title, description: input.description || null, dueAt, dueDate: dueAt, priority: input.priority, status: input.status, assignedProfileId: profile.isAdmin ? input.assignedProfileId || profile.profileId : profile.profileId } });
    await db.activityLog.create({ data: { action: "TASK_CREATED", message: `Task created: ${task.title}`, profileId: profile.profileId, taskId: task.id } });
  } else if (resource === "bookings") {
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the booking fields and try again." });
    const input = clean(parsed.data);
    const paid = Number(input.paidAmount ?? 0);
    const total = Number(input.totalPrice);
    const count = await db.booking.count();
    const packageItem = input.packageId ? await db.package.findUnique({ where: { id: input.packageId } }) : null;
    const client = await db.client.findUnique({ where: { id: input.clientId } });
    if (!client || (!profile.isAdmin && client.assignedProfileId !== profile.profileId)) return res.status(403).json({ error: "You can only create bookings for your assigned clients." });
    if (input.companyId) {
      const company = await db.company.findUnique({ where: { id: input.companyId } });
      if (!company || (!profile.isAdmin && company.assignedProfileId !== profile.profileId)) return res.status(403).json({ error: "You can only assign bookings to your agencies." });
    }
    await db.booking.create({ data: { bookingCode: `OB-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`, clientId: input.clientId, companyId: input.companyId || client.companyId || null, packageId: input.packageId || null, packageNameSnapshot: packageItem?.name ?? "Custom trip", travelDate: new Date(input.travelDate), travelers: input.travelers, totalPrice: total, paidAmount: paid, remainingAmount: Math.max(total - paid, 0), paymentStatus: paid <= 0 ? "UNPAID" : total - paid <= 0 ? "PAID" : "PARTIAL", bookingStatus: input.bookingStatus, assignedProfileId: profile.isAdmin ? input.assignedProfileId || profile.profileId : profile.profileId, notes: input.notes || null, activityLogs: { create: { action: "BOOKING_CREATED", message: `Booking created for ${packageItem?.name ?? "custom trip"}.`, profileId: profile.profileId } } } });
  } else if (resource === "payments") {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the payment fields and try again." });
    const input = clean(parsed.data);
    const booking = await db.booking.findUnique({ where: { id: input.bookingId }, include: { client: true } });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (!profile.isAdmin && booking.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "You can only record payments for your assigned bookings." });
    const newPaid = Number(booking.paidAmount) + Number(input.amountPaid);
    const total = Number(booking.totalPrice);
    await db.$transaction([
      db.payment.create({ data: { bookingId: booking.id, clientId: booking.clientId, clientName: booking.client.fullName, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, paymentDate: new Date(input.paymentDate), notes: input.notes || null, recordedById: profile.profileId, activityLogs: { create: { action: "PAYMENT_ADDED", message: `Payment added for ${booking.bookingCode}.`, profileId: profile.profileId } } } }),
      db.booking.update({ where: { id: booking.id }, data: { paidAmount: newPaid, remainingAmount: Math.max(total - newPaid, 0), paymentStatus: newPaid <= 0 ? "UNPAID" : total - newPaid <= 0 ? "PAID" : "PARTIAL" } }),
    ]);
  } else {
    return res.status(404).json({ error: "Unknown resource" });
  }

  res.json({ ok: true });
}));

app.get("/api/crm/:resource/:id", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const db = getPrisma();
  const resource = req.params.resource;
  const id = String(req.params.id);
  const activityWhere = { OR: [{ leadId: id }, { clientId: id }, { companyId: id }, { bookingId: id }, { paymentId: id }, { taskId: id }] };

  if (resource === "leads") {
    const lead = await db.lead.findUnique({ where: { id }, include: { assignedProfile: true, tasks: true, activityLogs: { include: { profile: true }, orderBy: { createdAt: "desc" }, take: 8 } } });
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    if (!profile.isAdmin && lead.assignedProfileId && lead.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    return res.json({ title: lead.clientName, subtitle: lead.phone, status: enumLabel(lead.status), fields: [
      ["Email", lead.email || "-"], ["Source", enumLabel(lead.source)], ["Destination", lead.interestedDestination || "-"], ["Package", lead.interestedPackage], ["Budget", lead.budget ? money(lead.budget.toString()) : "-"], ["Travel date", shortDate(lead.travelDate)], ["Travelers", lead.travelers], ["Assigned profile", lead.assignedProfile?.name ?? "Unassigned"], ["Notes", lead.notes || "-"],
    ], related: { tasks: lead.tasks.map((task) => ({ title: task.title, meta: `${enumLabel(task.status)} - ${shortDate(task.dueAt)}` })) }, activity: lead.activityLogs.map((item) => ({ message: item.message, profile: item.profile?.name ?? "-", date: shortDate(item.createdAt) })) });
  }

  if (resource === "clients") {
    const client = await db.client.findUnique({ where: { id }, include: { assignedProfile: true, company: true, bookings: { include: { package: true } }, tasks: true, uploadedFiles: true, activityLogs: { include: { profile: true }, orderBy: { createdAt: "desc" }, take: 8 } } });
    if (!client) return res.status(404).json({ error: "Client not found." });
    if (!profile.isAdmin && client.assignedProfileId && client.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    return res.json({ title: client.fullName, subtitle: client.phone, status: client.assignedProfile?.name ?? "Unassigned", fields: [
      ["Email", client.email || "-"], ["Company / Agency", client.company?.name ?? "-"], ["Nationality", client.nationality || "-"], ["Passport", client.passportNumber || "-"], ["Bookings", client.bookings.length], ["Paid", money(client.bookings.reduce((sum, booking) => sum + Number(booking.paidAmount), 0))], ["Remaining", money(client.bookings.reduce((sum, booking) => sum + Number(booking.remainingAmount), 0))], ["Notes", client.notes || "-"],
    ], related: { bookings: client.bookings.map((booking) => ({ title: booking.bookingCode, meta: `${booking.package?.name ?? booking.packageNameSnapshot ?? "Custom trip"} - ${enumLabel(booking.bookingStatus)}` })), tasks: client.tasks.map((task) => ({ title: task.title, meta: `${enumLabel(task.status)} - ${shortDate(task.dueAt)}` })), files: client.uploadedFiles.map((file) => ({ title: file.fileName, meta: `${Math.round(file.fileSize / 1024)} KB` })) }, activity: client.activityLogs.map((item) => ({ message: item.message, profile: item.profile?.name ?? "-", date: shortDate(item.createdAt) })) });
  }

  if (resource === "companies") {
    const company = await db.company.findUnique({ where: { id }, include: { assignedProfile: true, clients: true, bookings: { include: { client: true, package: true } }, activityLogs: { include: { profile: true }, orderBy: { createdAt: "desc" }, take: 8 } } });
    if (!company) return res.status(404).json({ error: "Agency not found." });
    if (!profile.isAdmin && company.assignedProfileId && company.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    return res.json({ title: company.name, subtitle: company.contactPerson || company.phone || "Agency account", status: enumLabel(company.status), fields: [
      ["Type", enumLabel(company.type)], ["Contact person", company.contactPerson || "-"], ["Phone", company.phone || "-"], ["Email", company.email || "-"], ["Address", company.address || "-"], ["Tax ID", company.taxId || "-"], ["Commission", company.commissionPercent == null ? "-" : `${company.commissionPercent}%`], ["Assigned profile", company.assignedProfile?.name ?? "Unassigned"], ["Notes", company.notes || "-"],
    ], related: { clients: company.clients.map((client) => ({ title: client.fullName, meta: client.phone })), bookings: company.bookings.map((booking) => ({ title: booking.bookingCode, meta: `${booking.client.fullName} - ${booking.package?.name ?? booking.packageNameSnapshot ?? "Custom trip"}` })) }, activity: company.activityLogs.map((item) => ({ message: item.message, profile: item.profile?.name ?? "-", date: shortDate(item.createdAt) })) });
  }

  if (resource === "packages") {
    const item = await db.package.findUnique({ where: { id }, include: { bookings: { include: { client: true } } } });
    if (!item) return res.status(404).json({ error: "Package not found." });
    return res.json({ title: item.name, subtitle: item.destination, status: enumLabel(item.status), fields: [
      ["Duration", item.duration], ["Price", money(item.price.toString())], ["Capacity", item.capacity], ["Included", item.includedServices], ["Excluded", item.excludedServices], ["Description", item.description],
    ], related: { bookings: item.bookings.map((booking) => ({ title: booking.bookingCode, meta: `${booking.client.fullName} - ${enumLabel(booking.bookingStatus)}` })) }, activity: [] });
  }

  if (resource === "bookings") {
    const booking = await db.booking.findUnique({ where: { id }, include: { client: true, company: true, package: true, assignedProfile: true, payments: true, tasks: true, uploadedFiles: true, activityLogs: { include: { profile: true }, orderBy: { createdAt: "desc" }, take: 8 } } });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (!profile.isAdmin && booking.assignedProfileId && booking.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    const timeline = [
      { type: "booking", title: "Booking created", meta: `${booking.package?.name ?? booking.packageNameSnapshot ?? "Custom trip"} for ${booking.client.fullName}`, date: timelineDate(booking.createdAt), tone: "blue" },
      { type: "travel", title: "Travel date", meta: `${booking.travelers} traveler${booking.travelers === 1 ? "" : "s"} scheduled`, date: timelineDate(booking.travelDate), tone: "amber" },
      ...booking.payments.map((payment) => ({ type: "payment", title: `Payment ${money(payment.amountPaid.toString())}`, meta: `${enumLabel(payment.paymentMethod)} - ${payment.notes || "Recorded payment"}`, date: timelineDate(payment.paymentDate), tone: "green" })),
      ...booking.tasks.map((task) => ({ type: "task", title: task.title, meta: `${enumLabel(task.status)} - ${enumLabel(task.priority)} priority`, date: timelineDate(task.dueAt), tone: task.status === "DONE" ? "green" : task.status === "MISSED" ? "red" : "amber" })),
      ...booking.uploadedFiles.map((file) => ({ type: "file", title: file.fileName, meta: `${Math.round(file.fileSize / 1024)} KB uploaded`, date: timelineDate(file.createdAt), tone: "gray" })),
      ...booking.activityLogs.map((item) => ({ type: "activity", title: enumLabel(item.action), meta: `${item.message} - ${item.profile?.name ?? "-"}`, date: timelineDate(item.createdAt), tone: item.action.includes("CANCEL") ? "red" : "gray" })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return res.json({ title: booking.bookingCode, subtitle: booking.client.fullName, status: enumLabel(booking.bookingStatus), fields: [
      ["Package", booking.package?.name ?? booking.packageNameSnapshot ?? "Custom trip"], ["Company / Agency", booking.company?.name ?? "-"], ["Travel date", shortDate(booking.travelDate)], ["Travelers", booking.travelers], ["Total", money(booking.totalPrice.toString())], ["Paid", money(booking.paidAmount.toString())], ["Remaining", money(booking.remainingAmount.toString())], ["Payment status", enumLabel(booking.paymentStatus)], ["Assigned profile", booking.assignedProfile?.name ?? "Unassigned"], ["Notes", booking.notes || "-"],
    ], related: { payments: booking.payments.map((payment) => ({ title: money(payment.amountPaid.toString()), meta: `${enumLabel(payment.paymentMethod)} - ${shortDate(payment.paymentDate)}` })), tasks: booking.tasks.map((task) => ({ title: task.title, meta: `${enumLabel(task.status)} - ${shortDate(task.dueAt)}` })), files: booking.uploadedFiles.map((file) => ({ title: file.fileName, meta: `${Math.round(file.fileSize / 1024)} KB` })) }, timeline: timeline.map((item) => ({ ...item, date: shortDate(new Date(item.date)) })), activity: booking.activityLogs.map((item) => ({ message: item.message, profile: item.profile?.name ?? "-", date: shortDate(item.createdAt) })) });
  }

  if (resource === "payments") {
    const payment = await db.payment.findUnique({ where: { id }, include: { booking: { include: { client: true } }, recordedBy: true, activityLogs: { include: { profile: true }, orderBy: { createdAt: "desc" }, take: 8 } } });
    if (!payment) return res.status(404).json({ error: "Payment not found." });
    if (!profile.isAdmin && payment.recordedById && payment.recordedById !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    return res.json({ title: money(payment.amountPaid.toString()), subtitle: payment.booking.bookingCode, status: enumLabel(payment.paymentMethod), fields: [
      ["Client", payment.booking.client.fullName], ["Payment date", shortDate(payment.paymentDate)], ["Recorded by", payment.recordedBy?.name ?? "-"], ["Notes", payment.notes || "-"],
    ], related: {}, activity: payment.activityLogs.map((item) => ({ message: item.message, profile: item.profile?.name ?? "-", date: shortDate(item.createdAt) })) });
  }

  if (resource === "tasks") {
    const task = await db.task.findUnique({ where: { id }, include: { assignedProfile: true, lead: true, client: true, booking: true, activityLogs: { include: { profile: true }, orderBy: { createdAt: "desc" }, take: 8 } } });
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (!profile.isAdmin && task.assignedProfileId && task.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    return res.json({ title: task.title, subtitle: shortDate(task.dueAt), status: enumLabel(task.status), fields: [
      ["Priority", enumLabel(task.priority)], ["Assigned profile", task.assignedProfile?.name ?? "Unassigned"], ["Description", task.description || "-"], ["Lead", task.lead?.clientName ?? "-"], ["Client", task.client?.fullName ?? "-"], ["Booking", task.booking?.bookingCode ?? "-"],
    ], related: {}, activity: task.activityLogs.map((item) => ({ message: item.message, profile: item.profile?.name ?? "-", date: shortDate(item.createdAt) })) });
  }

  const activity = await db.activityLog.findMany({ where: activityWhere, include: { profile: true }, orderBy: { createdAt: "desc" }, take: 8 });
  res.json({ title: "Record", subtitle: id, status: resource, fields: [["ID", id]], related: {}, activity: activity.map((item) => ({ message: item.message, profile: item.profile?.name ?? "-", date: shortDate(item.createdAt) })) });
}));

app.patch("/api/crm/:resource/:id", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const db = getPrisma();
  const resource = req.params.resource;
  const id = String(req.params.id);

  if (resource === "leads") {
    const parsed = leadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: `Check the lead fields: ${parsed.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", ")}.` });
    const input = clean(parsed.data);
    const existing = await db.lead.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Lead not found." });
    if (!profile.isAdmin && existing.assignedProfileId && existing.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    const lead = await db.lead.update({
      where: { id },
      data: {
        clientName: input.clientName,
        phone: input.phone,
        email: input.email || null,
        source: input.source,
        interestedDestination: input.interestedDestination || null,
        interestedPackage: input.interestedPackage,
        budget: input.budget,
        travelDate: input.travelDate ? new Date(input.travelDate) : null,
        travelers: input.travelers,
        travelersCount: input.travelers,
        status: input.status,
        assignedProfileId: profile.isAdmin ? input.assignedProfileId || profile.profileId : profile.profileId,
        notes: input.notes || null,
      },
    });
    await db.activityLog.create({ data: { action: "LEAD_EDITED", message: `Lead edited for ${lead.clientName}.`, profileId: profile.profileId, leadId: lead.id } });
    return res.json({ ok: true });
  }

  if (resource === "clients") {
    const parsed = clientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the client fields and try again." });
    const input = clean(parsed.data);
    const existing = await db.client.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Client not found." });
    if (!profile.isAdmin && existing.assignedProfileId && existing.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    if (input.companyId) {
      const company = await db.company.findUnique({ where: { id: input.companyId } });
      if (!company || (!profile.isAdmin && company.assignedProfileId !== profile.profileId)) return res.status(403).json({ error: "You can only assign clients to your agencies." });
    }
    const client = await db.client.update({
      where: { id },
      data: {
        fullName: input.fullName,
        phone: input.phone,
        email: input.email || null,
        nationality: input.nationality || null,
        passportNumber: input.passportNumber || null,
        companyId: input.companyId || null,
        notes: input.notes || null,
      },
    });
    await db.activityLog.create({ data: { action: "CLIENT_CREATED", message: `Client ${client.fullName} was edited.`, profileId: profile.profileId, clientId: client.id } });
    return res.json({ ok: true });
  }

  if (resource === "companies") {
    const parsed = companySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the agency fields and try again." });
    const input = clean(parsed.data);
    const existing = await db.company.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Agency not found." });
    if (!profile.isAdmin && existing.assignedProfileId && existing.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    const company = await db.company.update({
      where: { id },
      data: { name: input.name, type: input.type, status: input.status, contactPerson: input.contactPerson || null, phone: input.phone || null, email: input.email || null, address: input.address || null, taxId: input.taxId || null, commissionPercent: input.commissionPercent, assignedProfileId: profile.isAdmin ? input.assignedProfileId || profile.profileId : profile.profileId, notes: input.notes || null },
    });
    await db.activityLog.create({ data: { action: "COMPANY_UPDATED", message: `Agency edited: ${company.name}.`, profileId: profile.profileId, companyId: company.id } });
    return res.json({ ok: true });
  }

  if (resource === "companies") {
    const company = await db.company.findUnique({ where: { id }, include: { clients: true, bookings: true } });
    if (!company) return res.status(404).json({ error: "Agency not found." });
    if (!profile.isAdmin && company.assignedProfileId && company.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    if (company.clients.length || company.bookings.length) {
      const archived = await db.company.update({ where: { id }, data: { status: "ARCHIVED" } });
      await db.activityLog.create({ data: { action: "COMPANY_ARCHIVED", message: `Agency archived: ${archived.name}.`, profileId: profile.profileId, companyId: archived.id } });
      return res.json({ ok: true, archived: true });
    }
    await db.$transaction([
      db.activityLog.create({ data: { action: "COMPANY_ARCHIVED", message: `Agency deleted: ${company.name}.`, profileId: profile.profileId } }),
      db.company.delete({ where: { id } }),
    ]);
    return res.json({ ok: true });
  }

  if (resource === "packages") {
    if (!profile.isAdmin) return res.status(403).json({ error: "Only admin profiles can manage packages." });
    const parsed = packageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the package fields and try again." });
    const input = parsed.data;
    const item = await db.package.update({
      where: { id },
      data: {
        name: input.name,
        destination: input.destination,
        duration: input.duration,
        price: input.price,
        description: input.description,
        includedServices: input.includedServices,
        excludedServices: input.excludedServices,
        capacity: input.capacity,
        status: input.status,
      },
    });
    await db.activityLog.create({ data: { action: "PACKAGE_CREATED", message: `Package edited: ${item.name}`, profileId: profile.profileId } });
    return res.json({ ok: true });
  }

  if (resource === "bookings") {
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the booking fields and try again." });
    const input = clean(parsed.data);
    const existing = await db.booking.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Booking not found." });
    if (!profile.isAdmin && existing.assignedProfileId && existing.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    const client = await db.client.findUnique({ where: { id: input.clientId } });
    if (!client) return res.status(404).json({ error: "Client not found." });
    if (!profile.isAdmin && client.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "You can only use your assigned clients." });
    if (input.companyId) {
      const company = await db.company.findUnique({ where: { id: input.companyId } });
      if (!company || (!profile.isAdmin && company.assignedProfileId !== profile.profileId)) return res.status(403).json({ error: "You can only assign bookings to your agencies." });
    }
    const total = Number(input.totalPrice);
    const paid = Number(input.paidAmount ?? 0);
    const packageItem = input.packageId ? await db.package.findUnique({ where: { id: input.packageId } }) : null;
    const booking = await db.booking.update({
      where: { id },
      data: {
        clientId: input.clientId,
        companyId: input.companyId || client.companyId || null,
        packageId: input.packageId || null,
        packageNameSnapshot: packageItem?.name ?? existing.packageNameSnapshot ?? "Custom trip",
        travelDate: new Date(input.travelDate),
        travelers: input.travelers,
        totalPrice: total,
        paidAmount: paid,
        remainingAmount: Math.max(total - paid, 0),
        paymentStatus: paid <= 0 ? "UNPAID" : total - paid <= 0 ? "PAID" : "PARTIAL",
        bookingStatus: input.bookingStatus,
        assignedProfileId: profile.isAdmin ? input.assignedProfileId || profile.profileId : profile.profileId,
        notes: input.notes || null,
      },
    });
    await db.activityLog.create({ data: { action: "BOOKING_EDITED", message: `Booking edited: ${booking.bookingCode}.`, profileId: profile.profileId, bookingId: booking.id } });
    return res.json({ ok: true });
  }

  if (resource === "payments") {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the payment fields and try again." });
    const input = clean(parsed.data);
    const existing = await db.payment.findUnique({ where: { id }, include: { booking: true } });
    if (!existing) return res.status(404).json({ error: "Payment not found." });
    if (!profile.isAdmin && existing.recordedById && existing.recordedById !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    const booking = await db.booking.findUnique({ where: { id: input.bookingId }, include: { client: true, payments: true } });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (!profile.isAdmin && booking.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "You can only move payments to your assigned bookings." });
    const oldBookingId = existing.bookingId;
    await db.payment.update({
      where: { id },
      data: {
        bookingId: booking.id,
        clientId: booking.clientId,
        clientName: booking.client.fullName,
        amountPaid: input.amountPaid,
        paymentMethod: input.paymentMethod,
        paymentDate: new Date(input.paymentDate),
        notes: input.notes || null,
      },
    });
    const bookingIds = Array.from(new Set([oldBookingId, booking.id]));
    for (const bookingId of bookingIds) {
      const item = await db.booking.findUnique({ where: { id: bookingId } });
      if (!item) continue;
      const payments = await db.payment.findMany({ where: { bookingId } });
      const newPaid = payments.reduce((sum, payment) => sum + Number(payment.amountPaid), 0);
      const total = Number(item.totalPrice);
      await db.booking.update({ where: { id: bookingId }, data: { paidAmount: newPaid, remainingAmount: Math.max(total - newPaid, 0), paymentStatus: newPaid <= 0 ? "UNPAID" : total - newPaid <= 0 ? "PAID" : "PARTIAL" } });
    }
    await db.activityLog.create({ data: { action: "PAYMENT_ADDED", message: `Payment edited for ${booking.bookingCode}.`, profileId: profile.profileId, paymentId: id, bookingId: booking.id } });
    return res.json({ ok: true });
  }

  if (resource === "tasks") {
    const parsed = taskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the task fields and try again." });
    const input = clean(parsed.data);
    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Task not found." });
    if (!profile.isAdmin && existing.assignedProfileId && existing.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    const dueAt = new Date(input.dueAt);
    const task = await db.task.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description || null,
        dueAt,
        dueDate: dueAt,
        priority: input.priority,
        status: input.status,
        assignedProfileId: profile.isAdmin ? input.assignedProfileId || profile.profileId : profile.profileId,
      },
    });
    await db.activityLog.create({ data: { action: "TASK_CREATED", message: `Task edited: ${task.title}`, profileId: profile.profileId, taskId: task.id } });
    return res.json({ ok: true });
  }

  res.status(404).json({ error: "This resource cannot be edited yet." });
}));

app.delete("/api/crm/:resource/:id", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const db = getPrisma();
  const resource = req.params.resource;
  const id = String(req.params.id);

  if (resource === "leads") {
    const lead = await db.lead.findUnique({ where: { id } });
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    if (!profile.isAdmin && lead.assignedProfileId && lead.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    await db.$transaction([
      db.activityLog.create({ data: { action: "LEAD_DELETED", message: `Lead deleted for ${lead.clientName}.`, profileId: profile.profileId } }),
      db.lead.delete({ where: { id } }),
    ]);
    return res.json({ ok: true });
  }

  if (resource === "clients") {
    const client = await db.client.findUnique({ where: { id }, include: { bookings: true } });
    if (!client) return res.status(404).json({ error: "Client not found." });
    if (!profile.isAdmin && client.assignedProfileId && client.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    if (client.bookings.length) return res.status(409).json({ error: "This client has bookings. Cancel or reassign bookings before deleting the client." });
    await db.$transaction([
      db.activityLog.create({ data: { action: "CLIENT_CREATED", message: `Client ${client.fullName} was deleted.`, profileId: profile.profileId } }),
      db.client.delete({ where: { id } }),
    ]);
    return res.json({ ok: true });
  }

  if (resource === "packages") {
    if (!profile.isAdmin) return res.status(403).json({ error: "Only admin profiles can archive packages." });
    const item = await db.package.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: "Package not found." });
    const archived = await db.package.update({ where: { id }, data: { status: "ARCHIVED" } });
    await db.activityLog.create({ data: { action: "PACKAGE_CREATED", message: `Package archived: ${archived.name}`, profileId: profile.profileId } });
    return res.json({ ok: true, archived: true });
  }

  if (resource === "bookings") {
    const booking = await db.booking.findUnique({ where: { id } });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (!profile.isAdmin && booking.assignedProfileId && booking.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    const cancelled = await db.booking.update({ where: { id }, data: { bookingStatus: "CANCELLED" } });
    await db.activityLog.create({ data: { action: "BOOKING_CANCELLED", message: `Booking cancelled: ${cancelled.bookingCode}.`, profileId: profile.profileId, bookingId: cancelled.id } });
    return res.json({ ok: true, cancelled: true });
  }

  if (resource === "payments") {
    const payment = await db.payment.findUnique({ where: { id }, include: { booking: true } });
    if (!payment) return res.status(404).json({ error: "Payment not found." });
    if (!profile.isAdmin && payment.recordedById && payment.recordedById !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    await db.payment.delete({ where: { id } });
    const payments = await db.payment.findMany({ where: { bookingId: payment.bookingId } });
    const newPaid = payments.reduce((sum, item) => sum + Number(item.amountPaid), 0);
    const total = Number(payment.booking.totalPrice);
    await db.booking.update({ where: { id: payment.bookingId }, data: { paidAmount: newPaid, remainingAmount: Math.max(total - newPaid, 0), paymentStatus: newPaid <= 0 ? "UNPAID" : total - newPaid <= 0 ? "PAID" : "PARTIAL" } });
    await db.activityLog.create({ data: { action: "PAYMENT_ADDED", message: `Payment deleted from ${payment.booking.bookingCode}.`, profileId: profile.profileId, bookingId: payment.bookingId } });
    return res.json({ ok: true });
  }

  if (resource === "tasks") {
    const task = await db.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (!profile.isAdmin && task.assignedProfileId && task.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
    await db.$transaction([
      db.activityLog.create({ data: { action: "TASK_CREATED", message: `Task deleted: ${task.title}.`, profileId: profile.profileId } }),
      db.task.delete({ where: { id } }),
    ]);
    return res.json({ ok: true });
  }

  res.status(404).json({ error: "This resource cannot be deleted." });
}));

for (const resource of ["dashboard", "leads", "clients", "companies", "packages", "bookings", "payments", "tasks", "activity"] as const) {
  app.get(`/api/${resource}`, (req, res) => res.redirect(307, `/api/crm/${resource}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`));
  if (resource !== "dashboard" && resource !== "activity") {
    app.get(`/api/${resource}/:id`, (req, res) => res.redirect(307, `/api/crm/${resource}/${req.params.id}`));
    app.post(`/api/${resource}`, (_req, res) => res.redirect(307, `/api/crm/${resource}`));
    app.patch(`/api/${resource}/:id`, (req, res) => res.redirect(307, `/api/crm/${resource}/${req.params.id}`));
    app.delete(`/api/${resource}/:id`, (req, res) => res.redirect(307, `/api/crm/${resource}/${req.params.id}`));
  }
}

app.patch("/api/tasks/:id/complete", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const db = getPrisma();
  const existing = await db.task.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: "Task not found." });
  if (!profile.isAdmin && existing.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
  const task = await db.task.update({ where: { id: existing.id }, data: { status: "DONE" } });
  await db.activityLog.create({ data: { action: "TASK_COMPLETED", message: `Task completed: ${task.title}`, profileId: profile.profileId, taskId: task.id } });
  res.json({ ok: true });
}));

app.get("/api/reports/summary", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  const db = getPrisma();
  const [leads, bookings, payments, tasks] = await Promise.all([
    db.lead.count(),
    db.booking.count(),
    db.payment.aggregate({ _sum: { amountPaid: true } }),
    db.task.groupBy({ by: ["status"], _count: true }),
  ]);
  res.json({ leads, bookings, revenue: Number(payments._sum.amountPaid ?? 0), tasks });
}));

app.get("/api/deployment/checklist", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  const db = getPrisma();
  let databaseReady = false;
  try {
    await db.$queryRaw`SELECT 1`;
    databaseReady = true;
  } catch {
    databaseReady = false;
  }
  const sessionSecret = process.env.SESSION_SECRET ?? "";
  const isProduction = process.env.NODE_ENV === "production";
  const items = [
    deploymentItem("Environment", "Database URL", envPresent("DATABASE_URL"), "Postgres connection string is configured."),
    deploymentItem("Environment", "Direct database URL", envPresent("DIRECT_URL"), "Direct migration connection is configured.", true),
    deploymentItem("Environment", "Application URL", envPresent("APP_URL"), "Public CRM URL is set for email links and redirects.", true),
    deploymentItem("Security", "Session secret", sessionSecret.length >= 32, "SESSION_SECRET is at least 32 characters."),
    deploymentItem("Security", "Allowed email domain", envPresent("ALLOWED_EMAIL_DOMAIN"), "Login is restricted to the company email domain."),
    deploymentItem("Database", "Prisma connection", databaseReady, databaseReady ? "Database responded to a live health query." : "Database query failed."),
    deploymentItem("Storage", "Supabase URL", envPresent("SUPABASE_URL"), "Supabase project URL is configured."),
    deploymentItem("Storage", "Supabase service key", envPresent("SUPABASE_SERVICE_ROLE_KEY"), "Service role key is available for protected uploads."),
    deploymentItem("Storage", "Storage bucket", envPresent("SUPABASE_STORAGE_BUCKET"), "CRM file bucket name is configured."),
    deploymentItem("Email", "Resend API key", envPresent("RESEND_API_KEY"), "OTP email provider key is configured."),
    deploymentItem("Email", "OTP sender", envPresent("OTP_FROM_EMAIL"), "Sender identity is configured."),
    deploymentItem("Email", "Profile reset email", envPresent("PROFILE_RESET_EMAIL"), "Password reset owner email is configured.", true),
    deploymentItem("AI", "Gemini API key", envPresent("GEMINI_API_KEY"), "Onboard AI server key is configured.", true),
    deploymentItem("AI", "Gemini model", Boolean(geminiModel()), `Using ${geminiModel()} for Onboard AI.`),
    deploymentItem("Release", "Production runtime", isProduction, isProduction ? "NODE_ENV is production." : "Set NODE_ENV=production on the deployed server.", true),
    deploymentItem("Release", "Fixed OTP disabled", process.env.USE_FIXED_DEV_OTP !== "true", "Development fixed OTP is disabled."),
    deploymentItem("Release", "Demo seed disabled", process.env.SEED_DEMO_DATA !== "true", "Demo seed flag is disabled."),
  ];
  const ready = items.filter((item) => item.status === "ready").length;
  const blocking = items.filter((item) => item.status === "missing").length;
  const warnings = items.filter((item) => item.status === "warning").length;
  res.json({ items, summary: { ready, blocking, warnings, total: items.length } });
}));

for (const name of ["leads-by-profile", "conversion-rate", "revenue-by-profile", "bookings-by-package", "leads-by-source", "followup-completion"] as const) {
  app.get(`/api/reports/${name}`, asyncRoute(async (req, res) => {
    await requireAdmin(req);
    res.json({ rows: [], note: "Use /api/reports/summary and dashboard aggregates for this report in the current build." });
  }));
}

app.get("/api/export/:type", asyncRoute(async (req, res) => {
  const { profile } = await requireAdmin(req);
  const db = getPrisma();
  const type = req.params.type;
  let rows: Record<string, unknown>[] = [];
  if (type === "leads") rows = (await db.lead.findMany({ include: { assignedProfile: true }, orderBy: { createdAt: "desc" } })).map((x) => ({ clientName: x.clientName, phone: x.phone, email: x.email, source: x.source, status: x.status, profile: x.assignedProfile?.name, createdAt: x.createdAt.toISOString() }));
  else if (type === "clients") rows = (await db.client.findMany({ include: { assignedProfile: true }, orderBy: { createdAt: "desc" } })).map((x) => ({ fullName: x.fullName, phone: x.phone, email: x.email, nationality: x.nationality, profile: x.assignedProfile?.name, createdAt: x.createdAt.toISOString() }));
  else if (type === "companies") rows = (await db.company.findMany({ include: { assignedProfile: true }, orderBy: { createdAt: "desc" } })).map((x) => ({ name: x.name, type: x.type, status: x.status, contactPerson: x.contactPerson, phone: x.phone, email: x.email, commissionPercent: x.commissionPercent?.toString(), profile: x.assignedProfile?.name, createdAt: x.createdAt.toISOString() }));
  else if (type === "bookings") rows = (await db.booking.findMany({ include: { client: true, package: true, assignedProfile: true }, orderBy: { createdAt: "desc" } })).map((x) => ({ bookingCode: x.bookingCode, client: x.client.fullName, package: x.package?.name ?? x.packageNameSnapshot, totalPrice: x.totalPrice.toString(), paidAmount: x.paidAmount.toString(), remainingAmount: x.remainingAmount.toString(), bookingStatus: x.bookingStatus, paymentStatus: x.paymentStatus, profile: x.assignedProfile?.name }));
  else if (type === "payments") rows = (await db.payment.findMany({ include: { booking: true, recordedBy: true }, orderBy: { paymentDate: "desc" } })).map((x) => ({ bookingCode: x.booking.bookingCode, client: x.clientName, amount: x.amountPaid.toString(), method: x.paymentMethod, paymentDate: x.paymentDate.toISOString(), profile: x.recordedBy?.name }));
  else if (type === "reports") rows = [{ exportedAt: new Date().toISOString(), exportedBy: profile.profileName }];
  else return res.status(404).json({ error: "Unknown export type." });
  await db.activityLog.create({ data: { action: "DATA_EXPORTED", message: `${profile.profileName} exported ${type}.`, profileId: profile.profileId } });
  sendCsv(res, `onboard-${type}.csv`, rows);
}));

app.post("/api/tasks/:id/done", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const db = getPrisma();
  const existing = await db.task.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: "Task not found." });
  if (!profile.isAdmin && existing.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
  const task = await db.task.update({ where: { id: existing.id }, data: { status: "DONE" } });
  await db.activityLog.create({ data: { action: "TASK_COMPLETED", message: `Task completed: ${task.title}`, profileId: profile.profileId, taskId: task.id } });
  res.json({ ok: true });
}));

app.post("/api/import/:type/preview", upload.single("file"), asyncRoute(async (req, res) => {
  const { profile } = await requireAdmin(req);
  if (!req.file) return res.status(400).json({ error: "Choose an Excel file first." });
  const db = getPrisma();
  const type = String(req.params.type);
  const rows = await readWorksheetRows(req.file.buffer);
  const profiles = await db.profile.findMany({ select: { id: true, name: true } });
  const profileByName = new Map(profiles.map((item) => [normalizeHeader(item.name), item.id]));
  const parsed = parseImportRows(type, rows, profile.profileId, profileByName);
  if (!parsed) return res.status(404).json({ error: "Unknown import type" });
  const invalid = parsed.previewRows.filter((row) => row.status === "invalid").length;
  res.json({ ok: true, type, totalRows: rows.length, validRows: parsed.records.length, invalidRows: invalid, rows: parsed.previewRows.slice(0, 50) });
}));

app.post("/api/import/:type", upload.single("file"), asyncRoute(async (req, res) => {
  const { profile } = await requireAdmin(req);
  if (!req.file) return res.status(400).json({ error: "Choose an Excel file first." });
  const db = getPrisma();
  const type = String(req.params.type);
  const rows = await readWorksheetRows(req.file.buffer);
  const profiles = await db.profile.findMany({ select: { id: true, name: true } });
  const profileByName = new Map(profiles.map((item) => [normalizeHeader(item.name), item.id]));
  const parsed = parseImportRows(type, rows, profile.profileId, profileByName);
  if (!parsed) return res.status(404).json({ error: "Unknown import type" });

  if (type === "leads") {
    const leads = parsed.records;
    if (!leads.length) return res.status(400).json({ error: "No valid leads found." });
    await db.lead.createMany({ data: leads as never });
    await db.activityLog.create({ data: { action: "DATA_IMPORTED", message: `${profile.profileName} imported ${leads.length} leads from Excel.`, profileId: profile.profileId } });
    return res.json({ ok: true, message: `Imported ${leads.length} leads.` });
  }

  if (type === "tasks") {
    const tasks = parsed.records;
    if (!tasks.length) return res.status(400).json({ error: "No valid tasks found." });
    await db.task.createMany({ data: tasks as never });
    await db.activityLog.create({ data: { action: "DATA_IMPORTED", message: `${profile.profileName} imported ${tasks.length} tasks from Excel.`, profileId: profile.profileId } });
    return res.json({ ok: true, message: `Imported ${tasks.length} tasks.` });
  }

  if (type === "clients") {
    const clients = parsed.records;
    if (!clients.length) return res.status(400).json({ error: "No valid clients found." });
    await db.client.createMany({ data: clients as never });
    await db.activityLog.create({ data: { action: "DATA_IMPORTED", message: `${profile.profileName} imported ${clients.length} clients from Excel.`, profileId: profile.profileId } });
    return res.json({ ok: true, message: `Imported ${clients.length} clients.` });
  }

  res.status(404).json({ error: "Unknown import type" });
}));

app.post("/api/files/upload", upload.single("file"), asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  if (!req.file) return res.status(400).json({ error: "Choose a file to upload." });
  const db = getPrisma();
  const relatedBookingId = req.body.relatedBookingId || null;
  const relatedClientId = req.body.relatedClientId || null;
  if (relatedBookingId) {
    const booking = await db.booking.findUnique({ where: { id: relatedBookingId } });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (!profile.isAdmin && booking.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "You can only upload files to your assigned bookings." });
  }
  if (relatedClientId) {
    const client = await db.client.findUnique({ where: { id: relatedClientId } });
    if (!client) return res.status(404).json({ error: "Client not found." });
    if (!profile.isAdmin && client.assignedProfileId !== profile.profileId) return res.status(403).json({ error: "You can only upload files to your assigned clients." });
  }
  const bucket = storageBucket();
  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `${profile.profileId}/${Date.now()}-${safeName}`;
  const { error } = await getSupabase().storage.from(bucket).upload(storagePath, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = getSupabase().storage.from(bucket).getPublicUrl(storagePath);
  const file = await db.uploadedFile.create({
    data: {
      fileName: req.file.originalname,
      fileUrl: data.publicUrl,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      relatedBookingId,
      relatedClientId,
      uploadedByProfileId: profile.profileId,
    },
  });
  await db.activityLog.create({ data: { action: "FILE_UPLOADED", message: `File uploaded: ${file.fileName}`, profileId: profile.profileId } });
  res.json({ ok: true, file });
}));

app.get("/api/files", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const where = profile.isAdmin ? {} : { uploadedByProfileId: profile.profileId };
  const files = await getPrisma().uploadedFile.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ files });
}));

app.delete("/api/files/:id", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const db = getPrisma();
  const file = await db.uploadedFile.findUnique({ where: { id: String(req.params.id) } });
  if (!file) return res.status(404).json({ error: "File not found." });
  if (!profile.isAdmin && file.uploadedByProfileId !== profile.profileId) return res.status(403).json({ error: "Forbidden" });
  await db.uploadedFile.delete({ where: { id: file.id } });
  res.json({ ok: true });
}));

app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(error.status ?? 500).json({ error: error.message || "Internal server error" });
});

export default app;
