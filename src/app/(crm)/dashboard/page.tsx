import { getPrisma } from "@/lib/db";
import { getVisibleProfileFilter, requireProfile } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { Card, PageHeader, StatCard } from "@/components/ui";

export default async function DashboardPage() {
  const { profile } = await requireProfile();
  const filter = await getVisibleProfileFilter(profile);
  const db = getPrisma();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalLeads, newToday, pendingTasks, confirmedBookings, cancelledBookings, revenue, topProfiles, activity, upcoming] = await Promise.all([
    db.lead.count({ where: filter }),
    db.lead.count({ where: { ...filter, createdAt: { gte: today } } }),
    db.task.count({ where: { ...filter, status: "PENDING" } }),
    db.booking.count({ where: { ...filter, bookingStatus: "CONFIRMED" } }),
    db.booking.count({ where: { ...filter, bookingStatus: "CANCELLED" } }),
    db.payment.aggregate({ _sum: { amountPaid: true }, where: profile.isAdmin ? {} : { recordedById: profile.profileId } }),
    db.profile.findMany({ include: { leads: true, bookings: true }, take: 5, orderBy: { name: "asc" } }),
    db.activityLog.findMany({ where: profile.isAdmin ? {} : { profileId: profile.profileId }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.task.findMany({ where: { ...filter, status: "PENDING" }, orderBy: { dueAt: "asc" }, take: 6 }),
  ]);

  return (
    <>
      <PageHeader title="Dashboard" description="Live travel sales, follow-up, booking, and revenue overview." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Total leads" value={totalLeads} hint="All visible leads" />
        <StatCard label="New today" value={newToday} hint="Fresh inquiries" />
        <StatCard label="Pending follow-ups" value={pendingTasks} hint="Open tasks" />
        <StatCard label="Confirmed bookings" value={confirmedBookings} hint="Ready trips" />
        <StatCard label="Cancelled" value={cancelledBookings} hint="Lost bookings" />
        <StatCard label="Revenue" value={money(revenue._sum.amountPaid?.toString())} hint="Recorded payments" />
      </section>
      <section className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card>
          <h3 className="text-lg font-bold">Top performing profiles</h3>
          <div className="mt-4 space-y-3">
            {topProfiles.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-md bg-white/[0.03] p-3">
                <span className="font-semibold">{item.name}</span>
                <span className="text-sm text-zinc-400">{item.leads.length} leads / {item.bookings.length} bookings</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-bold">Upcoming follow-ups</h3>
          <div className="mt-4 space-y-3">
            {upcoming.map((task) => (
              <div key={task.id} className="rounded-md bg-white/[0.03] p-3">
                <p className="font-semibold">{task.title}</p>
                <p className="text-sm text-[#ef174b]">{shortDate(task.dueAt)}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-bold">Recent activity</h3>
          <div className="mt-4 space-y-3">
            {activity.map((item) => (
              <div key={item.id} className="rounded-md border-l-2 border-[#ef174b] bg-white/[0.03] p-3">
                <p className="text-sm">{item.message}</p>
                <p className="mt-1 text-xs text-zinc-500">{shortDate(item.createdAt)}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </>
  );
}
