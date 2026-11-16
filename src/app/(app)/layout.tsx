import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/server/auth";
import { config } from "@/server/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return (
    <AppShell me={{ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatar_url, demoMode: config.demoMode }}>{children}</AppShell>
  );
}
