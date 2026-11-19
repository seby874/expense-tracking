import { Coins, Heart, House, Leaf, PiggyBank, Star, Wallet } from "lucide-react";
import type { Appearance } from "../lib/appearance";
import { useAppearance } from "./appearance/controls";

const BRAND_LUCIDE = { wallet: Wallet, piggy: PiggyBank, coins: Coins, leaf: Leaf, home: House, star: Star, heart: Heart } as const;

/** Simbolo dell'app: il grafico originale oppure un'icona scelta in Impostazioni → Aspetto. */
export function BrandGlyph({ icon }: { icon: Appearance["brand"]["icon"] }) {
  if (icon === "chart") return <svg viewBox="0 0 32 32" fill="none">
    <path d="m6.5 19.5 6.1-6.1 4.4 4.1 8.5-9m-5.4 0h5.4v5.4M6.5 24h19"
      stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
  const Icon = BRAND_LUCIDE[icon];
  return <Icon size={20} />;
}

export function Mark() {
  const [appearance] = useAppearance();
  return <span className="brand-mark" aria-hidden="true"><BrandGlyph icon={appearance.brand.icon} /></span>;
}

/** Nome dell'app su due righe: dalla seconda parola in colore accento. */
export function BrandName({ className = "brand-name" }: { className?: string }) {
  const [appearance] = useAppearance();
  const [first, ...rest] = appearance.brand.name.split(" ");
  return <strong className={className}>{first}{rest.length > 0 && <> <span>{rest.join(" ")}</span></>}</strong>;
}
