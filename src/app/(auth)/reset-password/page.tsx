import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/PasswordForms";
import { getCurrentUser } from "@/server/auth";

export const metadata = { title: "Choose a new password · Meeti" };

/** Reached from the reset email: the link signs you in, then you pick a new password here. */
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/forgot-password?error=link");
  return <ResetPasswordForm email={user.email} />;
}
