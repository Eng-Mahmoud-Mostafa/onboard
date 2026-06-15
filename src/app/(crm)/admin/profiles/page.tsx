import { adminDeleteProfile } from "@/actions/crm";
import { Badge, PageHeader, Table } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export default async function AdminProfilesPage() {
  await requireAdmin();
  const profiles = await getPrisma().profile.findMany({
    include: { user: true, leads: true, bookings: true, tasks: true },
    orderBy: [{ isAdmin: "desc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader title="Profile management" description="Admin-only management for profile ownership, work totals, and CRM access." />
      <Table
        headers={["Profile", "Email owner", "Role", "Leads", "Bookings", "Tasks", "Action"]}
        rows={profiles.map((profile) => [
          profile.name,
          profile.user?.email ?? "Shared",
          profile.isAdmin ? <Badge key="role" tone="red">Admin</Badge> : <Badge key="role">Employee</Badge>,
          profile.leads.length,
          profile.bookings.length,
          profile.tasks.length,
          profile.isAdmin ? "-" : <form key="delete" action={adminDeleteProfile}><input type="hidden" name="id" value={profile.id} /><button className="text-[#ef174b] hover:text-white">Delete</button></form>,
        ])}
      />
    </>
  );
}
