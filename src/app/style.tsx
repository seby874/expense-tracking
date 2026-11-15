import type { CSSProperties, ReactNode } from "react";
import {
  Baby, Banknote, Beer, Bike, BookOpen, Briefcase, Bus, Car, Church, Coffee, CreditCard, Dumbbell, Film, Fuel, Gamepad2, Gift,
  GraduationCap, HandCoins, Heart, House, Landmark, Laptop, Music, PawPrint, PiggyBank, Pill, Pizza, Plane, Receipt, Scissors,
  Shirt, ShoppingBag, ShoppingCart, Smartphone, Sparkles, Stethoscope, Target, TrainFront, TrendingUp, Tv, Umbrella, Users,
  Utensils, Wallet, Wifi, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { TONES, TONE_HEX, type Tone } from "../lib/ledger";

/** Icone a scelta per conti, categorie e obiettivi: la chiave è quella salvata nei dati. */
export const ICONS: Record<string, LucideIcon> = {
  "shopping-cart": ShoppingCart, utensils: Utensils, coffee: Coffee, pizza: Pizza, beer: Beer, car: Car, fuel: Fuel, bus: Bus,
  train: TrainFront, bike: Bike, plane: Plane, house: House, zap: Zap, wifi: Wifi, smartphone: Smartphone, tv: Tv, laptop: Laptop,
  heart: Heart, pill: Pill, stethoscope: Stethoscope, dumbbell: Dumbbell, gamepad: Gamepad2, film: Film, music: Music, book: BookOpen,
  graduation: GraduationCap, shirt: Shirt, "shopping-bag": ShoppingBag, scissors: Scissors, gift: Gift, paw: PawPrint, baby: Baby,
  users: Users, church: Church, umbrella: Umbrella, wrench: Wrench, receipt: Receipt, briefcase: Briefcase, banknote: Banknote,
  "piggy-bank": PiggyBank, landmark: Landmark, "credit-card": CreditCard, wallet: Wallet, "trending-up": TrendingUp,
  "hand-coins": HandCoins, target: Target, sparkles: Sparkles,
};

export const TONE_NAMES: Record<Tone, string> = {
  green: "Verde", teal: "Petrolio", blue: "Blu", indigo: "Indaco", purple: "Viola", pink: "Rosa", red: "Rosso",
  orange: "Arancio", amber: "Ambra", olive: "Oliva", slate: "Ardesia",
};

export function isTone(value: string | undefined): value is Tone {
  return !!value && (TONES as readonly string[]).includes(value);
}

/** Classe CSS della tinta (sfondo chiaro + colore pieno, vedi globals.css). */
export function toneClass(color: string | undefined) {
  return isTone(color) ? ` tone-${color}` : "";
}

export function StyleIcon({ icon, size = 17, fallback }: { icon?: string; size?: number; fallback?: ReactNode }) {
  const Icon = icon ? ICONS[icon] : undefined;
  return Icon ? <Icon size={size} /> : <>{fallback ?? null}</>;
}

/** Scelta di colore e icona, usata da conti, categorie e obiettivi. */
export function StylePicker({ color, icon, onChange }: {
  color?: string; icon?: string; onChange: (style: { color?: string; icon?: string }) => void;
}) {
  return <div className="style-picker">
    <fieldset>
      <legend>Colore</legend>
      <div className="swatches">
        <button type="button" className="swatch swatch-none" aria-pressed={!color} title="Automatico" onClick={() => onChange({ color: undefined, icon })}>A</button>
        {TONES.map((tone) => <button type="button" key={tone} className="swatch" aria-pressed={color === tone} title={TONE_NAMES[tone]}
          aria-label={TONE_NAMES[tone]} style={{ "--swatch": TONE_HEX[tone] } as CSSProperties} onClick={() => onChange({ color: tone, icon })} />)}
      </div>
    </fieldset>
    <fieldset>
      <legend>Icona</legend>
      <div className="icon-grid">
        <button type="button" className="icon-choice" aria-pressed={!icon} title="Nessuna" onClick={() => onChange({ color, icon: undefined })}>—</button>
        {Object.entries(ICONS).map(([key, Icon]) => <button type="button" key={key} className="icon-choice" aria-pressed={icon === key} aria-label={key}
          onClick={() => onChange({ color, icon: key })}><Icon size={17} /></button>)}
      </div>
    </fieldset>
  </div>;
}

/** Colore principale dell'app (per dispositivo). */
export const ACCENTS = [
  ["green", "Verde"], ["blue", "Blu"], ["indigo", "Indaco"], ["purple", "Viola"], ["pink", "Rosa"], ["orange", "Arancio"], ["slate", "Ardesia"],
] as const;
export type Accent = (typeof ACCENTS)[number][0];
