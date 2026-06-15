import { createTask, markTaskDone } from "@/actions/crm";
import { ActionForm, Field, Select, TextArea } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { enumLabel, shortDate } from "@/lib/format";
import { getVisibleProfileFilter, requireProfile } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { profile } = await requireProfile();
  const { view } = await searchParams;
  const db = getPrisma();
  const now = new Date();
  const [tasks, profiles] = await Promise.all([
    db.task.findMany({
      where: {
        ...(await getVisibleProfileFilter(profile)),
        ...(view === "overdue" ? { dueAt: { lt: now }, status: "PENDING" } : {}),
        ...(view === "done" ? { status: "DONE" } : {}),
      },
      include: { assignedProfile: true },
      orderBy: { dueAt: "asc" },
      take: 80,
    }),
    db.profile.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Follow-ups / Tasks" description="Daily reminders, overdue work, priority tracking, and completion logs." />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <Card>
          <h3 className="mb-4 text-lg font-bold">Add task</h3>
          <ActionForm action={createTask}>
            <Field name="title" label="Task title" required />
            <TextArea name="description" label="Description" />
            <Field name="dueAt" label="Due date/time" type="datetime-local" required />
            <Select name="priority" label="Priority" options={["LOW", "MEDIUM", "HIGH"].map((value) => ({ value, label: enumLabel(value) }))} />
            <Select name="assignedProfileId" label="Assigned profile" options={profiles.map((p) => ({ value: p.id, label: p.name }))} />
          </ActionForm>
        </Card>
        <section>
          <div className="mb-4 flex flex-wrap gap-2">
            {["all", "overdue", "done"].map((item) => <a key={item} href={`/tasks?view=${item}`} className="rounded-md border border-white/10 px-3 py-2 text-sm capitalize hover:border-[#ef174b]">{item}</a>)}
          </div>
          {tasks.length ? (
            <Table
              headers={["Task", "Due", "Priority", "Status", "Profile", "Action"]}
              rows={tasks.map((task) => [
                task.title,
                shortDate(task.dueAt),
                <Badge key="priority" tone={task.priority === "HIGH" ? "red" : task.priority === "MEDIUM" ? "amber" : "neutral"}>{enumLabel(task.priority)}</Badge>,
                <Badge key="status" tone={task.status === "DONE" ? "green" : "amber"}>{enumLabel(task.status)}</Badge>,
                task.assignedProfile?.name ?? "Unassigned",
                task.status === "PENDING" ? <form key="done" action={markTaskDone}><input type="hidden" name="id" value={task.id} /><button className="text-[#ef174b] hover:text-white">Mark done</button></form> : "-",
              ])}
            />
          ) : (
            <EmptyState title="No tasks found" text="Create a follow-up reminder to keep every lead moving." />
          )}
        </section>
      </div>
    </>
  );
}
