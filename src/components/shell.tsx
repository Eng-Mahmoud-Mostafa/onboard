import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PackageOpen,
  Plane,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { signOut } from "@/actions/auth";
import { getUnlockedProfile, requireProfile } from "@/lib/auth";
import { OnboardLogo } from "@/components/logo";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: ClipboardList },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/packages", label: "Packages", icon: PackageOpen },
  { href: "/bookings", label: "Bookings", icon: Plane },
  { href: "/payments", label: "Payments", icon: CircleDollarSign },
  { href: "/tasks", label: "Follow-ups", icon: CalendarCheck },
  { href: "/reports", label: "Reports", icon: BarChart3, admin: true },
  { href: "/admin/profiles", label: "Admin", icon: ShieldCheck, admin: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();

  return (
    <div className="min-h-screen bg-black text-white">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-white/10 bg-zinc-950/95 p-5 lg:block">
        <OnboardLogo className="mb-8" />
        <nav className="space-y-1">
          {nav
            .filter((item) => !item.admin || profile.isAdmin)
            .map((item) => (
              <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white">
                <item.icon className="h-4 w-4 text-[#ef174b]" />
                {item.label}
              </Link>
            ))}
        </nav>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-black/80 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <OnboardLogo className="h-10 w-36 lg:hidden" />
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#ef174b]">Onboard Tours CRM</p>
                <h1 className="text-lg font-semibold">Profile: {profile.profileName}</h1>
              </div>
            </div>
            <form action={signOut}>
              <button className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-[#ef174b]/60 hover:text-white">
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

export async function RedirectIfProfileUnlocked({ children }: { children: React.ReactNode }) {
  const profile = await getUnlockedProfile();
  if (profile) redirect("/dashboard");
  return children;
}
