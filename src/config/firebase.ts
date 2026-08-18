import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "./env";

const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
const firebaseApp = getApps().length > 0
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount as ServiceAccount)
    });

export const messaging = getMessaging(firebaseApp);