import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminName = process.env.ADMIN_PROFILE_NAME ?? "nesma";
  const adminPassword = process.env.ADMIN_PROFILE_PASSWORD ?? "ChangeMe123!";
  const adminHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.profile.upsert({
    where: { name: adminName },
    update: { isAdmin: true },
    create: { name: adminName, isAdmin: true, passwordHash: adminHash },
  });

  if (process.env.NODE_ENV !== "development" && process.env.SEED_DEMO_DATA !== "true") {
    return;
  }

  const sara = await prisma.profile.upsert({
    where: { name: "sara" },
    update: {},
    create: { name: "sara", passwordHash: await bcrypt.hash("Travel123!", 12) },
  });

  const cairo = await prisma.package.upsert({
    where: { id: "demo-cairo-luxor" },
    update: {},
    create: {
      id: "demo-cairo-luxor",
      name: "Cairo & Luxor Signature",
      destination: "Egypt",
      duration: "7 days / 6 nights",
      price: 1850,
      description: "Premium cultural itinerary with guided experiences, hotel stays, and transfers.",
      includedServices: "Hotels, domestic transport, private guide, selected meals",
      excludedServices: "International flights, visa, optional tours",
      availableDates: [new Date("2026-07-12"), new Date("2026-08-09")],
      capacity: 22,
    },
  });

  const client = await prisma.client.upsert({
    where: { id: "demo-client-mariam" },
    update: {},
    create: {
      id: "demo-client-mariam",
      fullName: "Mariam Hassan",
      phone: "+20 100 555 0191",
      email: "mariam@example.com",
      nationality: "Egyptian",
      notes: "Prefers family-friendly departures.",
    },
  });

  const lead = await prisma.lead.upsert({
    where: { id: "demo-lead-red-sea" },
    update: {},
    create: {
      id: "demo-lead-red-sea",
      clientName: "Omar Adel",
      phone: "+20 111 232 4567",
      email: "omar@example.com",
      source: "INSTAGRAM",
      interestedPackage: "Red Sea escape",
      budget: 1200,
      travelDate: new Date("2026-07-20"),
      travelers: 2,
      status: "FOLLOW_UP",
      notes: "Asked for honeymoon options.",
      assignedProfileId: sara.id,
    },
  });

  const booking = await prisma.booking.upsert({
    where: { bookingCode: "OB-2026-0001" },
    update: {},
    create: {
      bookingCode: "OB-2026-0001",
      clientId: client.id,
      packageId: cairo.id,
      travelDate: new Date("2026-07-12"),
      travelers: 3,
      totalPrice: 5550,
      paidAmount: 2500,
      remainingAmount: 3050,
      paymentStatus: "PARTIAL",
      bookingStatus: "CONFIRMED",
      assignedProfileId: admin.id,
    },
  });

  await prisma.payment.upsert({
    where: { id: "demo-payment-1" },
    update: {},
    create: {
      id: "demo-payment-1",
      bookingId: booking.id,
      clientName: client.fullName,
      amountPaid: 2500,
      paymentMethod: "INSTAPAY",
      paymentDate: new Date("2026-06-14"),
      recordedById: admin.id,
    },
  });

  await prisma.task.upsert({
    where: { id: "demo-task-followup" },
    update: {},
    create: {
      id: "demo-task-followup",
      title: "Send Red Sea honeymoon quote",
      description: "Include 4-star and 5-star options.",
      dueAt: new Date("2026-06-16T10:00:00+03:00"),
      priority: "HIGH",
      assignedProfileId: sara.id,
      leadId: lead.id,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
