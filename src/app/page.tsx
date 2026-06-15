import { RequestOtpForm } from "@/components/auth-forms";
import { OnboardLogo } from "@/components/logo";
import { RedirectIfProfileUnlocked } from "@/components/shell";

export default function Home() {
  return (
    <RedirectIfProfileUnlocked>
      <main className="grid min-h-screen bg-black text-white lg:grid-cols-[1fr_520px]">
        <section className="relative hidden overflow-hidden border-r border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(239,23,75,0.25),transparent_30%),#050505] p-12 lg:block">
          <OnboardLogo className="h-20 w-72" />
          <div className="absolute bottom-12 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.45em] text-[#ef174b]">Travel Operations</p>
            <h1 className="mt-4 text-6xl font-black leading-none tracking-tight">Premium CRM for Onboard Tours.</h1>
            <p className="mt-6 text-lg leading-8 text-zinc-300">
              Secure OTP login, profile workspaces, travel leads, bookings, payments, follow-ups, reporting, and export tools for onboard-crm.com.
            </p>
          </div>
        </section>
        <section className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            <OnboardLogo className="mx-auto mb-10 h-20 w-72 lg:hidden" />
            <div className="rounded-lg border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-red-950/20">
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#ef174b]">Secure login</p>
              <h2 className="mt-3 text-3xl font-black">Enter your work email</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Only @onboard-tours.com email addresses can receive an OTP code.
              </p>
              <div className="mt-6">
                <RequestOtpForm />
              </div>
            </div>
          </div>
        </section>
      </main>
    </RedirectIfProfileUnlocked>
  );
}
