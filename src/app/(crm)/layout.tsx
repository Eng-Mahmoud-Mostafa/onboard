import { AppShell } from "@/components/shell";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
