import admin from "firebase-admin";
import { env } from "./env";

const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
  });
}

export default admin;