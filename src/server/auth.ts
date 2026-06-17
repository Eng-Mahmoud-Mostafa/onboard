import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { getPrisma } from "./db";

const sessionCookie = "onboard_session";
const profileCookie = "onboard_profile";

export type SessionPayload = { userId: string; email: string; keepSignedIn?: boolean };
export type ProfilePayload = { profileId: string; profileName: string; isAdmin: boolean };

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
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
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expiresIn).sign(secret());
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

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function setSession(res: Response, payload: SessionPayload, keepSignedIn = false) {
  const maxAge = keepSignedIn ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24;
  res.cookie(sessionCookie, await sign({ ...payload, keepSignedIn }, keepSignedIn ? "30d" : "24h"), cookieOptions(maxAge));
}

export async function setProfile(res: Response, payload: ProfilePayload, keepSignedIn = false) {
  const maxAge = keepSignedIn ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 12;
  res.cookie(profileCookie, await sign(payload, keepSignedIn ? "30d" : "12h"), cookieOptions(maxAge));
}

export function clearAuth(res: Response) {
  res.clearCookie(sessionCookie, { path: "/" });
  res.clearCookie(profileCookie, { path: "/" });
}

export async function getSession(req: Request) {
  return verify<SessionPayload>(req.cookies?.[sessionCookie]);
}

export async function getUnlockedProfile(req: Request) {
  return verify<ProfilePayload>(req.cookies?.[profileCookie]);
}

export async function requireSession(req: Request) {
  const session = await getSession(req);
  if (!session) {
    const error = new Error("Unauthorized");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return session;
}

export async function requireProfile(req: Request) {
  const session = await requireSession(req);
  const profile = await getUnlockedProfile(req);
  if (!profile) {
    const error = new Error("Profile is locked");
    (error as Error & { status?: number }).status = 423;
    throw error;
  }
  return { session, profile };
}

export async function requireAdmin(req: Request) {
  const auth = await requireProfile(req);
  if (!auth.profile.isAdmin) {
    const error = new Error("Forbidden");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return auth;
}

export function assignedFilter(profile: ProfilePayload) {
  return profile.isAdmin ? {} : { assignedProfileId: profile.profileId };
}

export function recordedFilter(profile: ProfilePayload) {
  return profile.isAdmin ? {} : { recordedById: profile.profileId };
}

export async function visibleProfiles(req: Request) {
  const session = await requireSession(req);
  return getPrisma().profile.findMany({
    where: { OR: [{ userId: session.userId }, { userId: null }] },
    select: { id: true, name: true, isAdmin: true, createdAt: true },
    orderBy: [{ isAdmin: "desc" }, { name: "asc" }],
  });
}
