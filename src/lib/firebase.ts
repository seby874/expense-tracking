import { initializeApp } from "firebase/app";
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

export const db = getFirestore(app);
