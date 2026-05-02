import { initializeApp, getApps } from "firebase/app";
import { getFirestore, enableNetwork, disableNetwork } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyASx0saii-gMIHmCC_e3i7gAIqL6NxUMZ4",
  authDomain: "cortexai-65075.firebaseapp.com",
  projectId: "cortexai-65075",
  storageBucket: "cortexai-65075.firebasestorage.app",
  messagingSenderId: "417649566965",
  appId: "1:417649566965:web:f36c20a9e7af9a77da91bc",
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const db = getFirestore(app);

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    enableNetwork(db).catch(() => {});
  });
  window.addEventListener("offline", () => {
    disableNetwork(db).catch(() => {});
  });
}
