import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/PasswordForms";

export const metadata = { title: "Reset your password · Meeti" };

export default function Page() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
