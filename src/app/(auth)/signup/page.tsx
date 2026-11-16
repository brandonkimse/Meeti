import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/server/auth";
import { config } from "@/server/config";

export default async function Page() {
  if (await getCurrentUser()) redirect("/home");
  return (
    <Suspense>
      <AuthForm mode="signup" demoMode={config.demoMode} />
    </Suspense>
  );
}
