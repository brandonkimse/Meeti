import { CATEGORIES, type Category } from "@/lib/types";
import { gradient } from "@/lib/client/colors";

/**
 * A place image. Uses a real photo when the provider supplies one; otherwise an
 * illustrated category cover (never a stock photo pretending to be the place).
 */
export function PlaceCover({ imageUrl, category, seed, compact = false, label }: { imageUrl: string | null; category: Category | null; seed: string; compact?: boolean; label?: string }) {
  if (imageUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={label ?? ""} className="h-full w-full object-cover" loading="lazy" />;
  const cat = CATEGORIES.find((c) => c.id === category);
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden" style={{ background: gradient(seed) }} aria-label={label}>
      <svg className="absolute inset-0 h-full w-full opacity-25" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d="M0 70 Q 30 50 55 68 T 100 60" stroke="white" strokeWidth="3" fill="none" />
        <path d="M20 0 L 35 100" stroke="white" strokeWidth="2" />
        <path d="M70 0 L 62 100" stroke="white" strokeWidth="2" />
      </svg>
      <span className={`relative drop-shadow-sm ${compact ? "text-2xl" : "text-5xl"}`}>{cat?.emoji ?? "📍"}</span>
    </div>
  );
}
