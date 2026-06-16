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
import { bookingSchema, clientSchema, leadSchema, packageSchema, paymentSchema, profileSchema, requestOtpSchema, taskSchema, verifyOtpSchema } from "./validators";
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
  await requireProfile(req);
  const db = getPrisma();
  const [profiles, clients, packages, bookings] = await Promise.all([
    db.profile.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.client.findMany({ select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.package.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.booking.findMany({ select: { id: true, bookingCode: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  res.json({ profiles, clients, packages, bookings });
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
    const [totalLeads, newToday, pendingTasks, confirmedBookings, cancelledBookings, revenue, upcoming, activity, profiles] = await Promise.all([
      db.lead.count({ where: filter }),
      db.lead.count({ where: { ...filter, createdAt: { gte: today } } }),
      db.task.count({ where: { ...filter, status: "PENDING" } }),
      db.booking.count({ where: { ...filter, bookingStatus: "CONFIRMED" } }),
      db.booking.count({ where: { ...filter, bookingStatus: "CANCELLED" } }),
      db.payment.aggregate({ _sum: { amountPaid: true }, where: recordedFilter(current.profile) }),
      db.task.findMany({ where: { ...filter, status: "PENDING" }, include: { assignedProfile: true }, orderBy: { dueAt: "asc" }, take: 8 }),
      db.activityLog.findMany({ where: current.profile.isAdmin ? {} : { profileId: current.profile.profileId }, include: { profile: true }, orderBy: { createdAt: "desc" }, take: 8 }),
      current.profile.isAdmin ? db.profile.findMany({ include: { leads: true, bookings: true, tasks: true, payments: true }, orderBy: [{ isAdmin: "desc" }, { name: "asc" }] }) : db.profile.findMany({ where: { id: current.profile.profileId }, include: { leads: true, bookings: true, tasks: true, payments: true } }),
    ]);
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
      isAdmin: current.profile.isAdmin,
    });
  }

  if (resource === "leads") {
    const where = { ...assignedFilter(current.profile), ...(q ? { OR: [{ clientName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}) };
    const [rows, total] = await Promise.all([db.lead.findMany({ where, include: { assignedProfile: true }, orderBy: { updatedAt: "desc" }, skip, take: pageSize }), db.lead.count({ where })]);
    return paged(res, rows.map((lead) => ({ client: lead.clientName, phone: lead.phone, source: enumLabel(lead.source), status: enumLabel(lead.status), profile: lead.assignedProfile?.name ?? "Unassigned", travel: shortDate(lead.travelDate), updated: shortDate(lead.updatedAt) })), total, page, pageSize);
  }

  if (resource === "clients") {
    const where = q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" as const } }] } : {};
    const [rows, total] = await Promise.all([db.client.findMany({ where, include: { bookings: true }, orderBy: { updatedAt: "desc" }, skip, take: pageSize }), db.client.count({ where })]);
    return paged(res, rows.map((client) => ({ name: client.fullName, phone: client.phone, email: client.email ?? "-", bookings: client.bookings.length, paid: money(client.bookings.reduce((sum, booking) => sum + Number(booking.paidAmount), 0)), remaining: money(client.bookings.reduce((sum, booking) => sum + Number(booking.remainingAmount), 0)) })), total, page, pageSize);
  }

  if (resource === "packages") {
    const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { destination: { contains: q, mode: "insensitive" as const } }] } : {};
    const [rows, total] = await Promise.all([db.package.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize }), db.package.count({ where })]);
    return paged(res, rows.map((item) => ({ name: item.name, destination: item.destination, duration: item.duration, price: money(item.price.toString()), capacity: item.capacity, status: enumLabel(item.status) })), total, page, pageSize);
  }

  if (resource === "bookings") {
    const where = { ...assignedFilter(current.profile), ...(q ? { OR: [{ bookingCode: { contains: q, mode: "insensitive" as const } }, { client: { fullName: { contains: q, mode: "insensitive" as const } } }, { package: { name: { contains: q, mode: "insensitive" as const } } }] } : {}) };
    const [rows, total] = await Promise.all([db.booking.findMany({ where, include: { client: true, package: true, assignedProfile: true }, orderBy: { createdAt: "desc" }, skip, take: pageSize }), db.booking.count({ where })]);
    return paged(res, rows.map((booking) => ({ code: booking.bookingCode, client: booking.client.fullName, package: booking.package?.name ?? booking.packageNameSnapshot ?? "Custom trip", travel: shortDate(booking.travelDate), total: money(booking.totalPrice.toString()), paid: money(booking.paidAmount.toString()), remaining: money(booking.remainingAmount.toString()), status: enumLabel(booking.bookingStatus), profile: booking.assignedProfile?.name ?? "Unassigned" })), total, page, pageSize);
  }

  if (resource === "payments") {
    const where = { ...recordedFilter(current.profile), ...(q ? { OR: [{ clientName: { contains: q, mode: "insensitive" as const } }, { booking: { bookingCode: { contains: q, mode: "insensitive" as const } } }] } : {}) };
    const [rows, total] = await Promise.all([db.payment.findMany({ where, include: { booking: true, recordedBy: true }, orderBy: { paymentDate: "desc" }, skip, take: pageSize }), db.payment.count({ where })]);
    return paged(res, rows.map((payment) => ({ booking: payment.booking.bookingCode, client: payment.clientName, amount: money(payment.amountPaid.toString()), method: enumLabel(payment.paymentMethod), date: shortDate(payment.paymentDate), profile: payment.recordedBy?.name ?? "-" })), total, page, pageSize);
  }

  if (resource === "tasks") {
    const where = { ...assignedFilter(current.profile), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}) };
    const [rows, total] = await Promise.all([db.task.findMany({ where, include: { assignedProfile: true }, orderBy: { dueAt: "asc" }, skip, take: pageSize }), db.task.count({ where })]);
    return paged(res, rows.map((task) => ({ id: task.id, task: task.title, due: shortDate(task.dueAt), priority: enumLabel(task.priority), status: enumLabel(task.status), profile: task.assignedProfile?.name ?? "Unassigned" })), total, page, pageSize);
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
    if (!parsed.success) return res.status(400).json({ error: "Check the lead fields and try again." });
    const input = clean(parsed.data);
    await db.lead.create({ data: { clientName: input.clientName, phone: input.phone, email: input.email || null, source: input.source, interestedPackage: input.interestedPackage, budget: input.budget, travelDate: input.travelDate ? new Date(input.travelDate) : null, travelers: input.travelers, status: input.status, assignedProfileId: input.assignedProfileId || profile.profileId, notes: input.notes || null, activityLogs: { create: { action: "LEAD_CREATED", message: `Lead created for ${input.clientName}.`, profileId: profile.profileId } } } });
  } else if (resource === "clients") {
    const parsed = clientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the client fields and try again." });
    const input = clean(parsed.data);
    await db.client.create({ data: { fullName: input.fullName, phone: input.phone, email: input.email || null, nationality: input.nationality || null, passportNumber: input.passportNumber || null, notes: input.notes || null, assignedProfileId: profile.profileId, activityLogs: { create: { action: "CLIENT_CREATED", message: `Client ${input.fullName} was added.`, profileId: profile.profileId } } } });
  } else if (resource === "packages") {
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
    const task = await db.task.create({ data: { title: input.title, description: input.description || null, dueAt, dueDate: dueAt, priority: input.priority, assignedProfileId: input.assignedProfileId || profile.profileId } });
    await db.activityLog.create({ data: { action: "TASK_CREATED", message: `Task created: ${task.title}`, profileId: profile.profileId, taskId: task.id } });
  } else if (resource === "bookings") {
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the booking fields and try again." });
    const input = clean(parsed.data);
    const paid = Number(input.paidAmount ?? 0);
    const total = Number(input.totalPrice);
    const count = await db.booking.count();
    const packageItem = await db.package.findUnique({ where: { id: input.packageId } });
    await db.booking.create({ data: { bookingCode: `OB-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`, clientId: input.clientId, packageId: input.packageId, packageNameSnapshot: packageItem?.name ?? "Custom trip", travelDate: new Date(input.travelDate), travelers: input.travelers, totalPrice: total, paidAmount: paid, remainingAmount: Math.max(total - paid, 0), paymentStatus: paid <= 0 ? "UNPAID" : total - paid <= 0 ? "PAID" : "PARTIAL", bookingStatus: input.bookingStatus, assignedProfileId: input.assignedProfileId || profile.profileId, notes: input.notes || null, activityLogs: { create: { action: "BOOKING_CREATED", message: `Booking created for ${packageItem?.name ?? "custom trip"}.`, profileId: profile.profileId } } } });
  } else if (resource === "payments") {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the payment fields and try again." });
    const input = clean(parsed.data);
    const booking = await db.booking.findUnique({ where: { id: input.bookingId }, include: { client: true } });
    if (!booking) return res.status(404).json({ error: "Booking not found." });
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

for (const resource of ["dashboard", "leads", "clients", "packages", "bookings", "payments", "tasks", "activity"] as const) {
  app.get(`/api/${resource}`, (req, res) => res.redirect(307, `/api/crm/${resource}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`));
  if (resource !== "dashboard" && resource !== "activity") {
    app.post(`/api/${resource}`, (_req, res) => res.redirect(307, `/api/crm/${resource}`));
  }
}

app.patch("/api/tasks/:id/complete", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const task = await getPrisma().task.update({ where: { id: String(req.params.id) }, data: { status: "DONE" } });
  await getPrisma().activityLog.create({ data: { action: "TASK_COMPLETED", message: `Task completed: ${task.title}`, profileId: profile.profileId, taskId: task.id } });
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
  else if (type === "bookings") rows = (await db.booking.findMany({ include: { client: true, package: true, assignedProfile: true }, orderBy: { createdAt: "desc" } })).map((x) => ({ bookingCode: x.bookingCode, client: x.client.fullName, package: x.package?.name ?? x.packageNameSnapshot, totalPrice: x.totalPrice.toString(), paidAmount: x.paidAmount.toString(), remainingAmount: x.remainingAmount.toString(), bookingStatus: x.bookingStatus, paymentStatus: x.paymentStatus, profile: x.assignedProfile?.name }));
  else if (type === "payments") rows = (await db.payment.findMany({ include: { booking: true, recordedBy: true }, orderBy: { paymentDate: "desc" } })).map((x) => ({ bookingCode: x.booking.bookingCode, client: x.clientName, amount: x.amountPaid.toString(), method: x.paymentMethod, paymentDate: x.paymentDate.toISOString(), profile: x.recordedBy?.name }));
  else if (type === "reports") rows = [{ exportedAt: new Date().toISOString(), exportedBy: profile.profileName }];
  else return res.status(404).json({ error: "Unknown export type." });
  await db.activityLog.create({ data: { action: "DATA_EXPORTED", message: `${profile.profileName} exported ${type}.`, profileId: profile.profileId } });
  sendCsv(res, `onboard-${type}.csv`, rows);
}));

app.post("/api/tasks/:id/done", asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  const task = await getPrisma().task.update({ where: { id: String(req.params.id) }, data: { status: "DONE" } });
  await getPrisma().activityLog.create({ data: { action: "TASK_COMPLETED", message: `Task completed: ${task.title}`, profileId: profile.profileId, taskId: task.id } });
  res.json({ ok: true });
}));

app.post("/api/import/:type", upload.single("file"), asyncRoute(async (req, res) => {
  const { profile } = await requireAdmin(req);
  if (!req.file) return res.status(400).json({ error: "Choose an Excel file first." });
  const db = getPrisma();
  const rows = await readWorksheetRows(req.file.buffer);
  const profiles = await db.profile.findMany({ select: { id: true, name: true } });
  const profileByName = new Map(profiles.map((item) => [normalizeHeader(item.name), item.id]));

  if (req.params.type === "leads") {
    const leads = rows.map((row) => {
      const clientName = text(row.clientname ?? row.name ?? row.fullname);
      const phone = text(row.phonenumber ?? row.phone ?? row.mobile);
      const interestedPackage = text(row.interesteddestinationpackage ?? row.interestedpackage ?? row.package ?? row.destination);
      if (!clientName || !phone || !interestedPackage) return null;
      return { clientName, phone, email: text(row.email) || null, source: enumValue(LeadSource, row.source, LeadSource.OTHER), interestedPackage, budget: Number(text(row.budget)) || null, travelDate: rowDate(row.traveldate), travelers: Number(text(row.travelers ?? row.numberoftravelers)) || 1, status: enumValue(LeadStatus, row.status, LeadStatus.NEW), assignedProfileId: profileByName.get(normalizeHeader(row.assignedprofile ?? row.profile)) ?? profile.profileId, notes: text(row.notes) || null };
    }).filter((lead): lead is NonNullable<typeof lead> => Boolean(lead));
    if (!leads.length) return res.status(400).json({ error: "No valid leads found." });
    await db.lead.createMany({ data: leads });
    await db.activityLog.create({ data: { action: "DATA_IMPORTED", message: `${profile.profileName} imported ${leads.length} leads from Excel.`, profileId: profile.profileId } });
    return res.json({ ok: true, message: `Imported ${leads.length} leads.` });
  }

  if (req.params.type === "tasks") {
    const tasks = rows.map((row) => {
      const title = text(row.tasktitle ?? row.title ?? row.task);
      const dueAt = rowDate(row.duedatetime ?? row.dueat ?? row.duedate);
      if (!title || !dueAt) return null;
      return { title, description: text(row.description) || null, dueAt, priority: enumValue(TaskPriority, row.priority, TaskPriority.MEDIUM), assignedProfileId: profileByName.get(normalizeHeader(row.assignedprofile ?? row.profile)) ?? profile.profileId };
    }).filter((task): task is NonNullable<typeof task> => Boolean(task));
    if (!tasks.length) return res.status(400).json({ error: "No valid tasks found." });
    await db.task.createMany({ data: tasks });
    await db.activityLog.create({ data: { action: "DATA_IMPORTED", message: `${profile.profileName} imported ${tasks.length} tasks from Excel.`, profileId: profile.profileId } });
    return res.json({ ok: true, message: `Imported ${tasks.length} tasks.` });
  }

  if (req.params.type === "clients") {
    const clients = rows.map((row) => {
      const fullName = text(row.fullname ?? row.name ?? row.clientname);
      const phone = text(row.phone ?? row.mobile ?? row.phonenumber);
      if (!fullName || !phone) return null;
      return {
        fullName,
        phone,
        email: text(row.email) || null,
        nationality: text(row.nationality) || null,
        passportNumber: text(row.passportnumber ?? row.passport) || null,
        notes: text(row.notes) || null,
        assignedProfileId: profile.profileId,
      };
    }).filter((client): client is NonNullable<typeof client> => Boolean(client));
    if (!clients.length) return res.status(400).json({ error: "No valid clients found." });
    await db.client.createMany({ data: clients });
    await db.activityLog.create({ data: { action: "DATA_IMPORTED", message: `${profile.profileName} imported ${clients.length} clients from Excel.`, profileId: profile.profileId } });
    return res.json({ ok: true, message: `Imported ${clients.length} clients.` });
  }

  res.status(404).json({ error: "Unknown import type" });
}));

app.post("/api/files/upload", upload.single("file"), asyncRoute(async (req, res) => {
  const { profile } = await requireProfile(req);
  if (!req.file) return res.status(400).json({ error: "Choose a file to upload." });
  const bucket = storageBucket();
  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `${profile.profileId}/${Date.now()}-${safeName}`;
  const { error } = await getSupabase().storage.from(bucket).upload(storagePath, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = getSupabase().storage.from(bucket).getPublicUrl(storagePath);
  const file = await getPrisma().uploadedFile.create({
    data: {
      fileName: req.file.originalname,
      fileUrl: data.publicUrl,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      relatedBookingId: req.body.relatedBookingId || null,
      relatedClientId: req.body.relatedClientId || null,
      uploadedByProfileId: profile.profileId,
    },
  });
  await getPrisma().activityLog.create({ data: { action: "FILE_UPLOADED", message: `File uploaded: ${file.fileName}`, profileId: profile.profileId } });
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
