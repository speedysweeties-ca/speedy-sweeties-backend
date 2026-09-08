import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { env } from "./env";

const createTestMessaging = (): Messaging =>
  ({
    send: async () => "test-message-id"
  }) as unknown as Messaging;

const createFirebaseMessaging = (): Messaging => {
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const firebaseApp = getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount as ServiceAccount)
      });

  return getMessaging(firebaseApp);
};

export const messaging =
  env.NODE_ENV === "test" ? createTestMessaging() : createFirebaseMessaging();
