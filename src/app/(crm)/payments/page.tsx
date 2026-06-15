import { addPayment } from "@/actions/crm";
import { ActionForm, Field, Select, TextArea } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { enumLabel, money, shortDate } from "@/lib/format";
import { getPrisma } from "@/lib/db";
import { requireProfile } from "@/lib/auth";

export default async function PaymentsPage() {
  const { profile } = await requireProfile();
  const db = getPrisma();
  const [payments, bookings] = await Promise.all([
    db.payment.findMany({
      where: profile.isAdmin ? {} : { recordedById: profile.profileId },
      include: { booking: true, recordedBy: true },
      orderBy: { paymentDate: "desc" },
      take: 100,
    }),
    db.booking.findMany({ include: { client: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <>
      <PageHeader title="Payments" description="Track paid amounts, remaining balances, payment methods, history, and revenue reporting." />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <Card>
          <h3 className="mb-4 text-lg font-bold">Add payment</h3>
          <ActionForm action={addPayment}>
            <Select name="bookingId" label="Booking" options={bookings.map((booking) => ({ value: booking.id, label: `${booking.bookingCode} - ${booking.client.fullName}` }))} />
            <Field name="amountPaid" label="Amount paid" type="number" required />
            <Select name="paymentMethod" label="Payment method" options={["CASH", "BANK_TRANSFER", "INSTAPAY", "VODAFONE_CASH", "CARD", "OTHER"].map((value) => ({ value, label: enumLabel(value) }))} />
            <Field name="paymentDate" label="Payment date" type="date" required />
            <TextArea name="notes" label="Notes" />
          </ActionForm>
        </Card>
        {payments.length ? (
          <Table
            headers={["Booking", "Client", "Amount", "Method", "Payment date", "Recorded by"]}
            rows={payments.map((payment) => [
              <span key="code" className="font-mono text-[#ef174b]">{payment.booking.bookingCode}</span>,
              payment.clientName,
              money(payment.amountPaid.toString()),
              <Badge key="method">{enumLabel(payment.paymentMethod)}</Badge>,
              shortDate(payment.paymentDate),
              payment.recordedBy?.name ?? "-",
            ])}
          />
        ) : (
          <EmptyState title="No payments yet" text="Payments will appear here after bookings receive deposits or balances." />
        )}
      </div>
    </>
  );
}
