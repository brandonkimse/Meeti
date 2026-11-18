import Link from "next/link";
import { Logo } from "./ui";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-6">
      <Link href="/">
        <Logo />
      </Link>
      <article className="legal mt-10 pb-16">
        <h1 className="font-display text-4xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        {children}
      </article>
    </div>
  );
}

/** Contact line from MEETI_OPERATOR_NAME / MEETI_CONTACT_EMAIL. */
export function Contact({ operator, email }: { operator: string; email: string }) {
  return (
    <>
      {operator || "The Meeti team"}
      {email ? (
        <>
          {" "}
          · <a href={`mailto:${email}`}>{email}</a>
        </>
      ) : null}
    </>
  );
}
