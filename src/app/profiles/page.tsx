import { CreateProfileForm, UnlockProfileForm } from "@/components/auth-forms";
import { OnboardLogo } from "@/components/logo";
import { getProfilesForSession } from "@/lib/auth";

export default async function ProfilesPage() {
  const profiles = await getProfilesForSession();

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <OnboardLogo className="mb-8 h-16 w-56" />
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#ef174b]">Work profiles</p>
          <h1 className="mt-3 text-4xl font-black">Choose your CRM workspace</h1>
          <p className="mt-2 text-zinc-400">Each profile has separate work, leads, bookings, notes, and activity history. Passwords are hashed before storage.</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <section className="grid gap-4 md:grid-cols-2">
            {profiles.map((profile) => (
              <article key={profile.id} className="rounded-lg border border-white/10 bg-zinc-950 p-5">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-2xl font-black">{profile.name}</h2>
                  {profile.isAdmin ? <span className="rounded-full border border-[#ef174b]/40 bg-[#ef174b]/10 px-3 py-1 text-xs font-bold text-[#ff7494]">Admin</span> : null}
                </div>
                <UnlockProfileForm profileId={profile.id} />
              </article>
            ))}
          </section>
          <aside className="rounded-lg border border-white/10 bg-zinc-950 p-5">
            <h2 className="text-xl font-black">Create profile</h2>
            <p className="mt-2 text-sm text-zinc-400">New employee workspaces are attached to your verified email session.</p>
            <div className="mt-5">
              <CreateProfileForm />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
