import { createLead, deleteLead } from "@/actions/crm";
import { ActionForm, Field, Select, TextArea } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { enumLabel, shortDate } from "@/lib/format";
import { getVisibleProfileFilter, requireProfile } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { profile } = await requireProfile();
  const { q, status } = await searchParams;
  const db = getPrisma();
  const [leads, profiles] = await Promise.all([
    db.lead.findMany({
      where: {
        ...(await getVisibleProfileFilter(profile)),
        ...(status ? { status: status as never } : {}),
        ...(q ? { OR: [{ clientName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
      },
      include: { assignedProfile: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    db.profile.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Leads" description="Capture inquiries, assign work, filter by status/source/date/profile, and convert high-intent travelers." />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card>
          <h3 className="mb-4 text-lg font-bold">Add lead</h3>
          <ActionForm action={createLead}>
            <Field name="clientName" label="Client name" required />
            <Field name="phone" label="Phone number" required />
            <Field name="email" label="Email" type="email" />
            <Select name="source" label="Source" options={["FACEBOOK", "INSTAGRAM", "WHATSAPP", "WEBSITE", "REFERRAL", "WALK_IN", "OTHER"].map((value) => ({ value, label: enumLabel(value) }))} />
            <Field name="interestedPackage" label="Interested destination/package" required />
            <div className="grid grid-cols-2 gap-3">
              <Field name="budget" label="Budget" type="number" />
              <Field name="travelers" label="Travelers" type="number" defaultValue={1} required />
            </div>
            <Field name="travelDate" label="Travel date" type="date" />
            <Select name="status" label="Status" options={["NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP", "CONVERTED", "LOST"].map((value) => ({ value, label: enumLabel(value) }))} />
            <Select name="assignedProfileId" label="Assigned profile" options={profiles.map((p) => ({ value: p.id, label: p.name }))} />
            <TextArea name="notes" label="Notes" />
          </ActionForm>
        </Card>
        <section>
          <form className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_120px]">
            <input name="q" placeholder="Search name, phone, email" className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2.5 text-white outline-none focus:border-[#ef174b]" />
            <select name="status" className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2.5 text-white outline-none focus:border-[#ef174b]">
              <option value="">All statuses</option>
              {["NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP", "CONVERTED", "LOST"].map((value) => <option key={value} value={value}>{enumLabel(value)}</option>)}
            </select>
            <button className="rounded-md border border-white/10 px-3 py-2.5 font-semibold hover:border-[#ef174b]">Filter</button>
          </form>
          {leads.length ? (
            <Table
              headers={["Client", "Phone", "Source", "Status", "Profile", "Travel", "Actions"]}
              rows={leads.map((lead) => [
                lead.clientName,
                lead.phone,
                enumLabel(lead.source),
                <Badge key="status" tone={lead.status === "CONVERTED" ? "green" : lead.status === "LOST" ? "red" : "amber"}>{enumLabel(lead.status)}</Badge>,
                lead.assignedProfile?.name ?? "Unassigned",
                shortDate(lead.travelDate),
                <form key="delete" action={deleteLead}><input type="hidden" name="id" value={lead.id} /><button className="text-[#ef174b] hover:text-white">Delete</button></form>,
              ])}
            />
          ) : (
            <EmptyState title="No leads yet" text="Add the first travel inquiry from the form." />
          )}
        </section>
      </div>
    </>
  );
}
