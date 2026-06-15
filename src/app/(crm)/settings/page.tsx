import { PageHeader, Card } from "@/components/ui";
import { allowedDomain, requireProfile } from "@/lib/auth";

export default async function SettingsPage() {
  const { session, profile } = await requireProfile();

  return (
    <>
      <PageHeader title="Settings" description="Deployment and security configuration for onboard-crm.com." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="text-lg font-bold">Current session</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-zinc-400">Email</dt><dd>{session.email}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-400">Profile</dt><dd>{profile.profileName}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-400">Admin</dt><dd>{profile.isAdmin ? "Yes" : "No"}</dd></div>
          </dl>
        </Card>
        <Card>
          <h3 className="text-lg font-bold">Environment variables</h3>
          <div className="mt-4 grid gap-2 font-mono text-xs text-zinc-300">
            <span>DATABASE_URL</span>
            <span>RESEND_API_KEY</span>
            <span>OTP_FROM_EMAIL</span>
            <span>NEXT_PUBLIC_APP_URL=https://onboard-crm.com</span>
            <span>ADMIN_PROFILE_NAME=nesma</span>
            <span>ALLOWED_EMAIL_DOMAIN={allowedDomain()}</span>
            <span>SESSION_SECRET</span>
          </div>
        </Card>
      </div>
    </>
  );
}
