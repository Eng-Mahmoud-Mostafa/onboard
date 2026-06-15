import { createClient } from "@/actions/crm";
import { ActionForm, Field, TextArea } from "@/components/action-form";
import { Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { money } from "@/lib/format";
import { getPrisma } from "@/lib/db";
import { requireProfile } from "@/lib/auth";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireProfile();
  const { q } = await searchParams;
  const clients = await getPrisma().client.findMany({
    where: q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] } : {},
    include: { bookings: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <>
      <PageHeader title="Clients" description="Traveler records with booking history, paid totals, and remaining balances." />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <Card>
          <h3 className="mb-4 text-lg font-bold">Add client</h3>
          <ActionForm action={createClient}>
            <Field name="fullName" label="Full name" required />
            <Field name="phone" label="Phone" required />
            <Field name="email" label="Email" type="email" />
            <Field name="nationality" label="Nationality" />
            <Field name="passportNumber" label="Passport number" />
            <TextArea name="notes" label="Notes" />
          </ActionForm>
        </Card>
        <section>
          <form className="mb-4 grid gap-3 md:grid-cols-[1fr_120px]">
            <input name="q" placeholder="Search clients" className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2.5 text-white outline-none focus:border-[#ef174b]" />
            <button className="rounded-md border border-white/10 px-3 py-2.5 font-semibold hover:border-[#ef174b]">Search</button>
          </form>
          {clients.length ? <Table headers={["Name", "Phone", "Email", "Bookings", "Total paid", "Remaining"]} rows={clients.map((client) => {
            const paid = client.bookings.reduce((sum, booking) => sum + Number(booking.paidAmount), 0);
            const remaining = client.bookings.reduce((sum, booking) => sum + Number(booking.remainingAmount), 0);
            return [client.fullName, client.phone, client.email ?? "-", client.bookings.length, money(paid), money(remaining)];
          })} /> : <EmptyState title="No clients yet" text="Add a traveler profile to begin tracking history." />}
        </section>
      </div>
    </>
  );
}
