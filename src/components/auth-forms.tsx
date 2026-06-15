"use client";

import { useActionState } from "react";
import { createProfile, requestOtp, unlockProfile, verifyOtp } from "@/actions/auth";

type State = { error?: string };

function Submit({ label }: { label: string }) {
  return (
    <button className="w-full rounded-md bg-[#ef174b] px-4 py-3 font-bold text-white shadow-lg shadow-red-950/40 transition hover:bg-[#ff2a5d]">
      {label}
    </button>
  );
}

function ErrorText({ state }: { state: State }) {
  return state.error ? <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{state.error}</p> : null;
}

export function RequestOtpForm() {
  const [state, action] = useActionState(requestOtp, {});
  return (
    <form action={action} className="space-y-4">
      <input
        name="email"
        type="email"
        required
        placeholder="name@onboard-tours.com"
        className="w-full rounded-md border border-white/10 bg-black px-4 py-3 text-white outline-none ring-[#ef174b]/40 transition placeholder:text-zinc-600 focus:border-[#ef174b] focus:ring-2"
      />
      <ErrorText state={state} />
      <Submit label="Send OTP" />
    </form>
  );
}

export function VerifyOtpForm({ email }: { email: string }) {
  const [state, action] = useActionState(verifyOtp, {});
  const [resendState, resendAction] = useActionState(requestOtp, {});
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <input
          name="otp"
          inputMode="numeric"
          maxLength={6}
          required
          placeholder="000000"
          className="w-full rounded-md border border-white/10 bg-black px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-white outline-none ring-[#ef174b]/40 transition placeholder:text-zinc-700 focus:border-[#ef174b] focus:ring-2"
        />
        <ErrorText state={state} />
        <Submit label="Verify and continue" />
      </form>
      <form action={resendAction}>
        <input type="hidden" name="email" value={email} />
        <button className="w-full rounded-md border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-[#ef174b]/60 hover:text-white">
          Resend OTP
        </button>
        <ErrorText state={resendState} />
      </form>
    </div>
  );
}

export function CreateProfileForm() {
  const [state, action] = useActionState(createProfile, {});
  return (
    <form action={action} className="space-y-4">
      <input name="name" required placeholder="Employee name" className="w-full rounded-md border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-[#ef174b]" />
      <input name="password" type="password" required minLength={8} placeholder="Profile password" className="w-full rounded-md border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-[#ef174b]" />
      <ErrorText state={state} />
      <Submit label="Create profile" />
    </form>
  );
}

export function UnlockProfileForm({ profileId }: { profileId: string }) {
  const [state, action] = useActionState(unlockProfile, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="profileId" value={profileId} />
      <input name="password" type="password" required placeholder="Profile password" className="w-full rounded-md border border-white/10 bg-black px-3 py-2.5 text-white outline-none focus:border-[#ef174b]" />
      <ErrorText state={state} />
      <button className="w-full rounded-md bg-white px-3 py-2.5 text-sm font-bold text-black transition hover:bg-[#ef174b] hover:text-white">
        Unlock
      </button>
    </form>
  );
}
