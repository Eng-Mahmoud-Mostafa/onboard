import { createBooking } from "@/actions/crm";
import { ActionForm, Field, Select, TextArea } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { enumLabel, money, shortDate } from "@/lib/format";
import { getVisibleProfileFilter, requireProfile } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export default async function BookingsPage() {
  const { profile } = await requireProfile();
  const db = getPrisma();
  const [bookings, clients, packages, profiles] = await Promise.all([
    db.booking.findMany({
      where: await getVisibleProfileFilter(profile),
      include: { client: true, package: true, assignedProfile: true, payments: true },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    db.client.findMany({ orderBy: { fullName: "asc" } }),
    db.package.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" } }),
    db.profile.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Bookings" description="Auto-coded reservations, payment status, booking timelines, and assigned profile ownership." />
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <Card>
          <h3 className="mb-4 text-lg font-bold">Create booking</h3>
          <ActionForm action={createBooking}>
            <Select name="clientId" label="Client" options={clients.map((client) => ({ value: client.id, label: client.fullName }))} />
            <Select name="packageId" label="Package/trip" options={packages.map((pkg) => ({ value: pkg.id, label: pkg.name }))} />
            <Field name="travelDate" label="Travel date" type="date" required />
            <Field name="travelers" label="Travelers" type="number" defaultValue={1} required />
            <Field name="totalPrice" label="Total price" type="number" required />
            <Field name="paidAmount" label="Paid amount" type="number" defaultValue={0} />
            <Select name="bookingStatus" label="Booking status" options={["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"].map((value) => ({ value, label: enumLabel(value) }))} />
            <Select name="assignedProfileId" label="Assigned profile" options={profiles.map((p) => ({ value: p.id, label: p.name }))} />
            <TextArea name="notes" label="Notes" />
          </ActionForm>
        </Card>
        {bookings.length ? (
          <Table
            headers={["Booking ID", "Client", "Package", "Travel", "Travelers", "Total", "Paid", "Remaining", "Status", "Profile"]}
            rows={bookings.map((booking) => [
              <span key="code" className="font-mono text-[#ef174b]">{booking.bookingCode}</span>,
              booking.client.fullName,
              booking.package.name,
              shortDate(booking.travelDate),
              booking.travelers,
              money(booking.totalPrice.toString()),
              money(booking.paidAmount.toString()),
              money(booking.remainingAmount.toString()),
              <Badge key="status" tone={booking.bookingStatus === "CONFIRMED" ? "green" : booking.bookingStatus === "CANCELLED" ? "red" : "amber"}>{enumLabel(booking.bookingStatus)}</Badge>,
              booking.assignedProfile?.name ?? "Unassigned",
            ])}
          />
        ) : (
          <EmptyState title="No bookings yet" text="Create bookings once clients and packages are available." />
        )}
      </div>
    </>
  );
}
