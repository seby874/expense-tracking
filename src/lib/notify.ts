// Promemoria del giorno come notifica del telefono (una al giorno, all'apertura dell'app).
// Su Android le notifiche passano da un service worker: public/notify-sw.js, che non salva nulla.
import type { TodayTask } from "./today";

const ENABLED_KEY = "et-notify";
const SENT_KEY = "et-notified";
const WORKER = "notify-sw.js";

/** Voci che meritano una notifica: ricorrenti da registrare, scadenze di oggi o superate, saldi del mese. */
export function todaySummary(tasks: TodayTask[]): { title: string; body: string } | null {
  const urgent = tasks.filter((task) => task.kind === "recurring" || task.kind === "balances" || (task.kind === "deadline" && task.days <= 1));
  if (!urgent.length) return null;
  const names = urgent.map((task) => task.kind === "recurring" ? task.item.recurring.value.template.title
    : task.kind === "deadline" ? task.deadline.value.title : "Saldi di fine mese");
  return { title: `${urgent.length} ${urgent.length === 1 ? "cosa" : "cose"} da fare oggi`, body: names.slice(0, 4).join(", ") + (names.length > 4 ? "…" : "") };
}

function storage() {
  try { return window.localStorage; } catch { return null; }
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function notificationsOn() {
  return notificationsSupported() && Notification.permission === "granted" && storage()?.getItem(ENABLED_KEY) === "1";
}

/** register() è idempotente: restituisce sempre il service worker delle notifiche (mai quello vecchio dell'uso offline). */
async function registration() {
  return navigator.serviceWorker.register(WORKER);
}

/** Accende le notifiche su questo dispositivo (chiede il permesso). */
export async function enableNotifications(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    storage()?.setItem(ENABLED_KEY, "1");
    await registration();
  }
  return permission;
}

export function disableNotifications() {
  storage()?.removeItem(ENABLED_KEY);
}

/** Mostra il riepilogo del giorno, una volta sola al giorno. */
export async function notifyToday(tasks: TodayTask[], today: string) {
  if (!notificationsOn() || storage()?.getItem(SENT_KEY) === today) return;
  const summary = todaySummary(tasks);
  if (!summary) return;
  try {
    const worker = await registration();
    await worker.showNotification(summary.title, { body: summary.body, tag: "et-today", icon: "icon-192.png", badge: "icon-192.png" });
    storage()?.setItem(SENT_KEY, today);
  } catch (error) {
    console.warn("Notifica non mostrata:", error);
  }
}
