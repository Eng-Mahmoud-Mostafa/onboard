import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

export async function GET(_: Request, { params }: { params: Promise<{ type: string }> }) {
  const { profile } = await requireAdmin();
  const { type } = await params;
  const db = getPrisma();
  let rows: Record<string, unknown>[] = [];

  if (type === "leads") {
    rows = (await db.lead.findMany({ include: { assignedProfile: true } })).map((lead) => ({
      clientName: lead.clientName,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      status: lead.status,
      assignedProfile: lead.assignedProfile?.name,
      createdAt: lead.createdAt.toISOString(),
    }));
  } else if (type === "clients") {
    rows = await db.client.findMany();
  } else if (type === "bookings") {
    rows = (await db.booking.findMany({ include: { client: true, package: true } })).map((booking) => ({
      bookingCode: booking.bookingCode,
      client: booking.client.fullName,
      package: booking.package.name,
      totalPrice: booking.totalPrice.toString(),
      paidAmount: booking.paidAmount.toString(),
      remainingAmount: booking.remainingAmount.toString(),
      status: booking.bookingStatus,
    }));
  } else if (type === "payments") {
    rows = (await db.payment.findMany({ include: { booking: true } })).map((payment) => ({
      bookingCode: payment.booking.bookingCode,
      clientName: payment.clientName,
      amountPaid: payment.amountPaid.toString(),
      method: payment.paymentMethod,
      paymentDate: payment.paymentDate.toISOString(),
    }));
  } else {
    const profiles = await db.profile.findMany({ include: { leads: true, bookings: true, payments: true } });
    rows = profiles.map((item) => ({
      profile: item.name,
      leads: item.leads.length,
      converted: item.leads.filter((lead) => lead.status === "CONVERTED").length,
      bookings: item.bookings.length,
      revenue: item.payments.reduce((sum, payment) => sum + Number(payment.amountPaid), 0),
    }));
  }

  await db.activityLog.create({
    data: {
      action: "DATA_EXPORTED",
      message: `${profile.profileName} exported ${type}.`,
      profileId: profile.profileId,
    },
  });

  return new NextResponse(csv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="onboard-${type}.csv"`,
    },
  });
}
