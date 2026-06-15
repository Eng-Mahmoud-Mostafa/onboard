import { archivePackage, createPackage } from "@/actions/crm";
import { ActionForm, Field, Select, TextArea } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { enumLabel, money } from "@/lib/format";
import { getPrisma } from "@/lib/db";
import { requireProfile } from "@/lib/auth";

export default async function PackagesPage() {
  await requireProfile();
  const packages = await getPrisma().package.findMany({ include: { bookings: true }, orderBy: { updatedAt: "desc" } });

  return (
    <>
      <PageHeader title="Packages / Trips" description="Manage travel inventory, pricing, capacity, inclusions, exclusions, and booking demand." />
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <Card>
          <h3 className="mb-4 text-lg font-bold">Add package</h3>
          <ActionForm action={createPackage}>
            <Field name="name" label="Package name" required />
            <Field name="destination" label="Destination" required />
            <Field name="duration" label="Duration" required />
            <Field name="price" label="Price" type="number" required />
            <Field name="capacity" label="Capacity" type="number" required />
            <Select name="status" label="Status" options={["ACTIVE", "DRAFT", "ARCHIVED"].map((value) => ({ value, label: enumLabel(value) }))} />
            <TextArea name="description" label="Description" />
            <TextArea name="includedServices" label="Included services" />
            <TextArea name="excludedServices" label="Excluded services" />
          </ActionForm>
        </Card>
        {packages.length ? (
          <Table
            headers={["Package", "Destination", "Duration", "Price", "Capacity", "Status", "Bookings", "Actions"]}
            rows={packages.map((pkg) => [
              pkg.name,
              pkg.destination,
              pkg.duration,
              money(pkg.price.toString()),
              pkg.capacity,
              <Badge key="status" tone={pkg.status === "ACTIVE" ? "green" : pkg.status === "ARCHIVED" ? "red" : "amber"}>{enumLabel(pkg.status)}</Badge>,
              pkg.bookings.length,
              <form key="archive" action={archivePackage}><input type="hidden" name="id" value={pkg.id} /><button className="text-[#ef174b] hover:text-white">Archive</button></form>,
            ])}
          />
        ) : (
          <EmptyState title="No packages yet" text="Add active trips for booking teams to sell." />
        )}
      </div>
    </>
  );
}
