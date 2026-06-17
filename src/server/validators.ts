import { z } from "zod";

export const emailSchema = z.string().trim().email().toLowerCase();
const optionalText = z.preprocess((value) => value === "" ? undefined : value, z.string().trim().optional());
const optionalEmail = z.preprocess((value) => value === "" ? undefined : value, z.string().trim().email().optional());
const optionalDateText = z.preprocess((value) => value === "" ? undefined : value, z.string().optional());
const optionalNonnegativeNumber = z.preprocess((value) => value === "" || value == null ? undefined : value, z.coerce.number().nonnegative().optional());
export const requestOtpSchema = z.object({ email: emailSchema });
export const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: z.string().trim().regex(/^\d{6}$/),
});
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(40),
  password: z.string().min(8).max(128),
});
export const leadSchema = z.object({
  clientName: z.string().trim().min(2),
  phone: z.string().trim().min(5),
  email: optionalEmail,
  source: z.enum(["FACEBOOK", "INSTAGRAM", "WHATSAPP", "WEBSITE", "REFERRAL", "WALK_IN", "OTHER"]),
  interestedDestination: optionalText,
  interestedPackage: z.preprocess((value) => value === "" || value == null ? "General travel inquiry" : value, z.string().trim().min(2)),
  budget: optionalNonnegativeNumber,
  travelDate: optionalDateText,
  travelers: z.preprocess((value) => value === "" || value == null ? 1 : value, z.coerce.number().int().positive()).default(1),
  status: z.enum(["NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP", "CONVERTED", "LOST"]).default("NEW"),
  assignedProfileId: optionalText,
  notes: optionalText,
});
export const clientSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(5),
  email: z.string().trim().email().optional().or(z.literal("")),
  nationality: z.string().optional(),
  passportNumber: z.string().optional(),
  companyId: optionalText,
  notes: z.string().optional(),
});
export const companySchema = z.object({
  name: z.string().trim().min(2),
  type: z.enum(["TRAVEL_AGENCY", "CORPORATE", "HOTEL", "PARTNER", "OTHER"]).default("TRAVEL_AGENCY"),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  contactPerson: optionalText,
  phone: optionalText,
  email: optionalEmail,
  address: optionalText,
  taxId: optionalText,
  commissionPercent: optionalNonnegativeNumber,
  assignedProfileId: optionalText,
  notes: optionalText,
});
export const packageSchema = z.object({
  name: z.string().trim().min(2),
  destination: z.string().trim().min(2),
  duration: z.string().trim().min(2),
  price: z.coerce.number().nonnegative(),
  description: z.string().trim().min(2),
  includedServices: z.string().trim().min(2),
  excludedServices: z.string().trim().min(2),
  capacity: z.coerce.number().int().positive(),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).default("ACTIVE"),
});
export const taskSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().optional(),
  dueAt: z.string().min(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  status: z.enum(["PENDING", "DONE", "MISSED"]).default("PENDING"),
  assignedProfileId: z.string().optional(),
});
export const bookingSchema = z.object({
  clientId: z.string().min(1),
  companyId: optionalText,
  packageId: optionalText,
  travelDate: z.string().min(1),
  travelers: z.coerce.number().int().positive(),
  totalPrice: z.coerce.number().nonnegative(),
  paidAmount: z.coerce.number().nonnegative().default(0),
  bookingStatus: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]).default("PENDING"),
  assignedProfileId: z.string().optional(),
  notes: z.string().optional(),
});
export const paymentSchema = z.object({
  bookingId: z.string().min(1),
  amountPaid: z.coerce.number().positive(),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "INSTAPAY", "VODAFONE_CASH", "CARD", "OTHER"]),
  paymentDate: z.string().min(1),
  notes: z.string().optional(),
});
