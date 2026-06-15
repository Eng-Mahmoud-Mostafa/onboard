"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { requireAdmin, requireProfile } from "@/lib/auth";
import { bookingSchema, clientSchema, leadSchema, packageSchema, paymentSchema, taskSchema } from "@/lib/validators";

type ActionState = { ok?: boolean; error?: string };

function data(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function clean<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, entry === "" ? undefined : entry]),
  ) as T;
}

export async function createLead(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile();
  const parsed = leadSchema.safeParse(data(formData));
  if (!parsed.success) return { error: "Check the lead fields and try again." };
  const input = clean(parsed.data);
  const db = getPrisma();

  await db.lead.create({
    data: {
      clientName: input.clientName,
      phone: input.phone,
      email: input.email || null,
      source: input.source,
      interestedPackage: input.interestedPackage,
      budget: input.budget,
      travelDate: input.travelDate ? new Date(input.travelDate) : null,
      travelers: input.travelers,
      status: input.status,
      assignedProfileId: input.assignedProfileId || profile.profileId,
      notes: input.notes || null,
      activityLogs: {
        create: {
          action: "LEAD_CREATED",
          message: `Lead created for ${input.clientName}.`,
          profileId: profile.profileId,
        },
      },
    },
  });

  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createClient(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile();
  const parsed = clientSchema.safeParse(data(formData));
  if (!parsed.success) return { error: "Check the client fields and try again." };
  const input = clean(parsed.data);

  await getPrisma().client.create({
    data: {
      fullName: input.fullName,
      phone: input.phone,
      email: input.email || null,
      nationality: input.nationality || null,
      passportNumber: input.passportNumber || null,
      notes: input.notes || null,
      activityLogs: {
        create: {
          action: "CLIENT_CREATED",
          message: `Client ${input.fullName} was added.`,
          profileId: profile.profileId,
        },
      },
    },
  });

  revalidatePath("/clients");
  return { ok: true };
}

export async function createBooking(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile();
  const parsed = bookingSchema.safeParse(data(formData));
  if (!parsed.success) return { error: "Check the booking fields and try again." };
  const input = clean(parsed.data);
  const db = getPrisma();
  const paid = Number(input.paidAmount ?? 0);
  const total = Number(input.totalPrice);
  const remaining = Math.max(total - paid, 0);
  const count = await db.booking.count();
  const bookingCode = `OB-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  await db.booking.create({
    data: {
      bookingCode,
      clientId: input.clientId,
      packageId: input.packageId,
      travelDate: new Date(input.travelDate),
      travelers: input.travelers,
      totalPrice: total,
      paidAmount: paid,
      remainingAmount: remaining,
      paymentStatus: paid <= 0 ? "UNPAID" : remaining <= 0 ? "PAID" : "PARTIAL",
      bookingStatus: input.bookingStatus,
      assignedProfileId: input.assignedProfileId || profile.profileId,
      notes: input.notes || null,
      activityLogs: {
        create: {
          action: "BOOKING_CREATED",
          message: `Booking ${bookingCode} was created.`,
          profileId: profile.profileId,
        },
      },
    },
  });

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function addPayment(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile();
  const parsed = paymentSchema.safeParse(data(formData));
  if (!parsed.success) return { error: "Check the payment fields and try again." };
  const input = clean(parsed.data);
  const db = getPrisma();
  const booking = await db.booking.findUnique({ where: { id: input.bookingId }, include: { client: true } });
  if (!booking) return { error: "Booking not found." };

  const newPaid = Number(booking.paidAmount) + Number(input.amountPaid);
  const total = Number(booking.totalPrice);
  const remaining = Math.max(total - newPaid, 0);

  await db.$transaction([
    db.payment.create({
      data: {
        bookingId: booking.id,
        clientName: booking.client.fullName,
        amountPaid: input.amountPaid,
        paymentMethod: input.paymentMethod,
        paymentDate: new Date(input.paymentDate),
        notes: input.notes || null,
        recordedById: profile.profileId,
        activityLogs: {
          create: {
            action: "PAYMENT_ADDED",
            message: `Payment added for ${booking.bookingCode}.`,
            profileId: profile.profileId,
          },
        },
      },
    }),
    db.booking.update({
      where: { id: booking.id },
      data: {
        paidAmount: newPaid,
        remainingAmount: remaining,
        paymentStatus: newPaid <= 0 ? "UNPAID" : remaining <= 0 ? "PAID" : "PARTIAL",
      },
    }),
  ]);

  revalidatePath("/payments");
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createPackage(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const parsed = packageSchema.safeParse(data(formData));
  if (!parsed.success) return { error: "Check the package fields and try again." };
  const input = parsed.data;

  await getPrisma().package.create({
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
      availableDates: [],
    },
  });

  revalidatePath("/packages");
  return { ok: true };
}

export async function createTask(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile();
  const parsed = taskSchema.safeParse(data(formData));
  if (!parsed.success) return { error: "Check the task fields and try again." };
  const input = clean(parsed.data);

  await getPrisma().task.create({
    data: {
      title: input.title,
      description: input.description || null,
      dueAt: new Date(input.dueAt),
      priority: input.priority,
      assignedProfileId: input.assignedProfileId || profile.profileId,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function markTaskDone(formData: FormData) {
  const { profile } = await requireProfile();
  const id = String(formData.get("id"));
  const db = getPrisma();
  const task = await db.task.update({
    where: { id },
    data: { status: "DONE" },
  });

  await db.activityLog.create({
    data: {
      action: "TASK_COMPLETED",
      message: `Task completed: ${task.title}`,
      profileId: profile.profileId,
      taskId: task.id,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function archivePackage(formData: FormData) {
  await requireProfile();
  await getPrisma().package.update({
    where: { id: String(formData.get("id")) },
    data: { status: "ARCHIVED" },
  });
  revalidatePath("/packages");
}

export async function deleteLead(formData: FormData) {
  await requireProfile();
  await getPrisma().lead.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

export async function adminDeleteProfile(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  await getPrisma().profile.delete({ where: { id } });
  revalidatePath("/admin/profiles");
}
