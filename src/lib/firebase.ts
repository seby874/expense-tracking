import { initializeApp } from "firebase/app";
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import {
  CACHE_SIZE_UNLIMITED, clearIndexedDbPersistence, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";
import { readOffline, takeCacheClear } from "./preferences";

// Questa configurazione è pubblica per natura (finisce nel bundle del browser).
// La protezione dei dati è data dalle regole Firestore e dalle restrizioni
// della chiave API nella Google Cloud Console: vedi la guida di pubblicazione.
const firebaseConfig = {
  apiKey: "AIzaSyAX9V-FiSU01wGOMJIblsrkP_jqigfPL6A",
  authDomain: "express-tracking-69e6e.firebaseapp.com",
  projectId: "express-tracking-69e6e",
  storageBucket: "express-tracking-69e6e.firebasestorage.app",
  messagingSenderId: "977497198174",
  appId: "1:977497198174:web:044f65771aae9cc95eaecf"
};

const app = initializeApp(firebaseConfig);

// initializeAuth invece di getAuth: l'app usa solo email e password, quindi non
// carica il modulo popup/redirect (niente script esterni da apis.google.com).
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});
auth.languageCode = "it";

/** Uso offline attivato su questo dispositivo (Impostazioni → Aspetto e dispositivo). */
export const offlineEnabled = readOffline();

// Con l'uso offline i dati restano anche nel browser (IndexedDB); senza, solo in memoria.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: offlineEnabled
    // Dimensione illimitata: l'archivio è piccolo e un documento tolto dalla cache andrebbe riletto dal server.
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED })
    : memoryLocalCache(),
});

// Dopo un'uscita o dopo aver disattivato l'offline, la copia locale si cancella
// qui, prima che Firestore la apra. Le altre funzioni attendono questa promessa.
export const firestoreReady: Promise<void> = takeCacheClear()
  ? clearIndexedDbPersistence(db).catch((error) => console.warn("Pulizia della copia locale non riuscita:", error))
  : Promise.resolve();
