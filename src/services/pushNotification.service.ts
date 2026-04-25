import admin from "firebase-admin";

const savedCustomerTokens: string[] = [];

export function saveCustomerFcmToken(token: string): void {
  if (!savedCustomerTokens.includes(token)) {
    savedCustomerTokens.push(token);
  }
}

export async function sendOutForDeliveryNotification(): Promise<void> {
  if (savedCustomerTokens.length === 0) {
    console.log("No customer FCM tokens saved");
    return;
  }

  for (const token of savedCustomerTokens) {
    await admin.messaging().send({
      token,
      notification: {
        title: "Speedy Sweeties 🚗",
        body: "Your order is now out for delivery!"
      }
    });
  }

  console.log("Out for delivery push sent");
}