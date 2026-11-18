import Link from "next/link";

/** Small footer links to the privacy policy and terms. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`mt-6 flex justify-center gap-4 text-xs text-faint ${className}`}>
      <Link href="/privacy" className="hover:text-ink">
        Privacy
      </Link>
      <Link href="/terms" className="hover:text-ink">
        Terms
      </Link>
    </nav>
  );
}
