import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Card, PageHeader, StatCard, Table } from "@/components/ui";
import { enumLabel, money } from "@/lib/format";
import { getPrisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export default async function ReportsPage() {
  await requireAdmin();
  const db = getPrisma();
  const [profiles, leadsBySource, bookings, payments, tasks] = await Promise.all([
    db.profile.findMany({ include: { leads: true, bookings: true, payments: true } }),
    db.lead.groupBy({ by: ["source"], _count: true }),
    db.booking.findMany({ include: { package: true, assignedProfile: true } }),
    db.payment.findMany({ include: { recordedBy: true } }),
    db.task.findMany(),
  ]);

  const revenue = payments.reduce((sum, payment) => sum + Number(payment.amountPaid), 0);
  const completedTasks = tasks.filter((task) => task.status === "DONE").length;
  const converted = profiles.reduce((sum, profile) => sum + profile.leads.filter((lead) => lead.status === "CONVERTED").length, 0);
  const totalLeads = profiles.reduce((sum, profile) => sum + profile.leads.length, 0);

  return (
    <>
      <PageHeader
        title="Admin reports"
        description="Nesma-only profile performance, source attribution, bookings by package, revenue, conversion, and exports."
        action={<Link href="/api/export/reports" className="inline-flex items-center gap-2 rounded-md bg-[#ef174b] px-4 py-3 text-sm font-bold text-white"><BarChart3 className="h-4 w-4" /> Export CSV</Link>}
      />
      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total revenue" value={money(revenue)} hint="All payments" />
        <StatCard label="Conversion rate" value={`${totalLeads ? Math.round((converted / totalLeads) * 100) : 0}%`} hint="Converted leads" />
        <StatCard label="Bookings" value={bookings.length} hint="All packages" />
        <StatCard label="Follow-up completion" value={`${tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0}%`} hint="Tasks marked done" />
      </section>
      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-lg font-bold">Profile performance</h3>
          <Table headers={["Profile", "Leads", "Bookings", "Revenue"]} rows={profiles.map((profile) => [
            profile.name,
            profile.leads.length,
            profile.bookings.length,
            money(profile.payments.reduce((sum, payment) => sum + Number(payment.amountPaid), 0)),
          ])} />
        </Card>
        <Card>
          <h3 className="mb-4 text-lg font-bold">Leads by source</h3>
          <Table headers={["Source", "Leads"]} rows={leadsBySource.map((row) => [enumLabel(row.source), row._count])} />
        </Card>
      </section>
    </>
  );
}
