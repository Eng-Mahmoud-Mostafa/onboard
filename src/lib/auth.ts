import "server-only";

import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/db";

const sessionCookie = "onboard_session";
const profileCookie = "onboard_profile";

type SessionPayload = {
  userId: string;
  email: string;
};

type ProfilePayload = {
  profileId: string;
  profileName: string;
  isAdmin: boolean;
};

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters.");
  }
  return new TextEncoder().encode(value);
}

export function allowedDomain() {
  return process.env.ALLOWED_EMAIL_DOMAIN ?? "onboard-tours.com";
}

export function isAllowedEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${allowedDomain()}`);
}

export async function hashValue(value: string) {
  return bcrypt.hash(value, 12);
}

export async function compareHash(value: string, hash: string) {
  return bcrypt.compare(value, hash);
}

async function sign(payload: Record<string, unknown>, expiresIn: string) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());
}

async function verify<T>(token?: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as T;
  } catch {
    return null;
  }
}

export async function setSession(payload: SessionPayload) {
  const jar = await cookies();
  jar.set(sessionCookie, await sign(payload, "7d"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function setProfile(payload: ProfilePayload) {
  const jar = await cookies();
  jar.set(profileCookie, await sign(payload, "12h"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearAuth() {
  const jar = await cookies();
  jar.delete(sessionCookie);
  jar.delete(profileCookie);
}

export async function getSession() {
  const jar = await cookies();
  return verify<SessionPayload>(jar.get(sessionCookie)?.value);
}

export async function getUnlockedProfile() {
  const jar = await cookies();
  return verify<ProfilePayload>(jar.get(profileCookie)?.value);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/");
  return session;
}

export async function requireProfile() {
  const session = await requireSession();
  const profile = await getUnlockedProfile();
  if (!profile) redirect("/profiles");
  return { session, profile };
}

export async function requireAdmin() {
  const auth = await requireProfile();
  if (!auth.profile.isAdmin) redirect("/dashboard");
  return auth;
}

export async function getVisibleProfileFilter(profile: ProfilePayload) {
  if (profile.isAdmin) return {};
  return { assignedProfileId: profile.profileId };
}

export async function getProfilesForSession() {
  const session = await requireSession();
  const db = getPrisma();
  return db.profile.findMany({
    where: { OR: [{ userId: session.userId }, { userId: null }] },
    orderBy: [{ isAdmin: "desc" }, { name: "asc" }],
  });
}
