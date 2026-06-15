import Link from "next/link";
import { VerifyOtpForm } from "@/components/auth-forms";
import { OnboardLogo } from "@/components/logo";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-red-950/20">
        <OnboardLogo className="mb-8 h-16 w-56" />
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#ef174b]">OTP verification</p>
        <h1 className="mt-3 text-3xl font-black">Check your email</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">We sent a 6-digit code to {email || "your work email"}. It expires in 10 minutes.</p>
        {process.env.NODE_ENV !== "production" && process.env.DEV_OTP_CODE ? (
          <p className="mt-3 rounded-md border border-[#ef174b]/30 bg-[#ef174b]/10 p-3 text-sm text-red-100">
            Local dev OTP: <span className="font-mono font-bold tracking-widest">{process.env.DEV_OTP_CODE}</span>
          </p>
        ) : null}
        <div className="mt-6">
          <VerifyOtpForm email={email} />
        </div>
        <Link href="/" className="mt-6 block text-center text-sm text-zinc-400 hover:text-white">
          Use a different email
        </Link>
      </div>
    </main>
  );
}
