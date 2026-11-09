import { APP_NAME } from "../lib/config";

export function Mark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none">
    <path d="m6.5 19.5 6.1-6.1 4.4 4.1 8.5-9m-5.4 0h5.4v5.4M6.5 24h19"
      stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg></span>;
}

/** "Expense Tracking" su due righe: la seconda parola in colore accento. */
export function BrandName({ className = "brand-name" }: { className?: string }) {
  const [first, ...rest] = APP_NAME.split(" ");
  return <strong className={className}>{first}{rest.length > 0 && <> <span>{rest.join(" ")}</span></>}</strong>;
}
