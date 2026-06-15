"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/db";
import { sendOtpEmail } from "@/lib/email";
import {
  allowedDomain,
  clearAuth,
  compareHash,
  hashValue,
  isAllowedEmail,
  setProfile,
  setSession,
} from "@/lib/auth";
import { profileSchema, requestOtpSchema, verifyOtpSchema } from "@/lib/validators";

type ActionState = { ok?: boolean; error?: string };

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function requestOtp(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = requestOtpSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: "Enter a valid work email." };

  const email = parsed.data.email;
  if (!isAllowedEmail(email)) {
    return { error: `Only @${allowedDomain()} email addresses can log in.` };
  }

  try {
    const db = getPrisma();
    const recent = await db.otpToken.count({
      where: {
        email,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });

    if (recent >= 3) {
      return { error: "Too many login codes requested. Please wait 15 minutes." };
    }

    const devOtp = process.env.NODE_ENV !== "production" ? process.env.DEV_OTP_CODE : undefined;
    const otp = devOtp || crypto.randomInt(100000, 999999).toString();
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: { email },
    });

    await db.otpToken.create({
      data: {
        email,
        tokenHash: await hashValue(otp),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        userId: user.id,
      },
    });

    const skipEmail = process.env.NODE_ENV !== "production" && process.env.SKIP_OTP_EMAIL_IN_DEV === "true";
    if (!skipEmail) {
      await sendOtpEmail(email, otp);
    }
  } catch (error) {
    console.error("OTP request failed", error);
    return { error: "Could not create OTP. Check DATABASE_URL, DIRECT_URL, and migrations." };
  }

  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

export async function verifyOtp(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = verifyOtpSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: "Enter the 6-digit code." };

  const db = getPrisma();
  const token = await db.otpToken.findFirst({
    where: {
      email: parsed.data.email,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!token) return { error: "This code expired. Request a new OTP." };
  if (token.attemptCount >= 5) return { error: "Too many attempts. Request a new OTP." };

  const matches = await compareHash(parsed.data.otp, token.tokenHash);
  await db.otpToken.update({
    where: { id: token.id },
    data: {
      attemptCount: { increment: 1 },
      consumedAt: matches ? new Date() : undefined,
    },
  });

  if (!matches) return { error: "Incorrect code. Try again." };

  const user = await db.user.findUniqueOrThrow({ where: { email: parsed.data.email } });
  await setSession({ userId: user.id, email: user.email });
  redirect("/profiles");
}

export async function createProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const { requireSession } = await import("@/lib/auth");
  const session = await requireSession();
  const parsed = profileSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: "Profile name and password are required." };

  const adminName = process.env.ADMIN_PROFILE_NAME ?? "nesma";
  const db = getPrisma();
  const exists = await db.profile.findUnique({ where: { name: parsed.data.name } });
  if (exists) return { error: "A profile with that name already exists." };

  await db.profile.create({
    data: {
      name: parsed.data.name,
      passwordHash: await hashValue(parsed.data.password),
      isAdmin: parsed.data.name.toLowerCase() === adminName.toLowerCase(),
      userId: session.userId,
      activityLogs: {
        create: {
          action: "PROFILE_CREATED",
          message: `Profile ${parsed.data.name} was created.`,
        },
      },
    },
  });

  revalidatePath("/profiles");
  redirect("/profiles");
}

export async function unlockProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const { requireSession } = await import("@/lib/auth");
  await requireSession();

  const profileId = String(formData.get("profileId") ?? "");
  const password = String(formData.get("password") ?? "");
  const db = getPrisma();
  const profile = await db.profile.findUnique({ where: { id: profileId } });

  if (!profile || !(await compareHash(password, profile.passwordHash))) {
    return { error: "Profile password is incorrect." };
  }

  await setProfile({ profileId: profile.id, profileName: profile.name, isAdmin: profile.isAdmin });
  await db.activityLog.create({
    data: {
      action: "PROFILE_LOGGED_IN",
      message: `${profile.name} unlocked their CRM workspace.`,
      profileId: profile.id,
    },
  });
  redirect("/dashboard");
}

export async function signOut() {
  await clearAuth();
  redirect("/");
}
