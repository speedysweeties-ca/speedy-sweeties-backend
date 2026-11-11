// Review-only overlay. The approved/published policy and its rebuild hashes stay intact.
import { proposedPrivacyPolicy } from './privacy-policy-proposed.mjs';

export const androidPrivacyPolicy = structuredClone(proposedPrivacyPolicy);
androidPrivacyPolicy.introduction = androidPrivacyPolicy.introduction.replace(
  'the Speedy Sweeties Delivery app for iPhone and iPad,',
  'the Speedy Sweeties Delivery app for iPhone and iPad, the Speedy Sweeties Android customer app (ca.speedysweeties.customer),'
);
const section = id => androidPrivacyPolicy.sections.find(value => value.id === id);

section('location').paragraphs[0] = 'On iPhone and iPad, ' + section('location').paragraphs[0].replace(/^You/, 'you');
section('speech-ai').title = 'Optional speech recognition and OpenAI';
section('speech-ai').paragraphs[0] = 'On iPhone and iPad, ' + section('speech-ai').paragraphs[0].replace(/^You/, 'you');
section('speech-ai').paragraphs[2] = section('speech-ai').paragraphs[2].replace(
  'If you agree and finish your speech,', 'When a voice-draft request is made,'
);
section('choices').paragraphs[0] = 'On iPhone and iPad, ' + section('choices').paragraphs[0].replace(/^Choose/, 'choose');
section('choices').paragraphs[1] = section('choices').paragraphs[1].replace(
  'Speedy Sweeties, Apple or OpenAI', "Speedy Sweeties, Apple, your Android speech provider or OpenAI"
);
section('providers-storage').paragraphs[1] = 'On iPhone and iPad, ' + section('providers-storage').paragraphs[1].replace(/^The app/, 'the app');

androidPrivacyPolicy.sections.splice(androidPrivacyPolicy.sections.findIndex(value => value.id === 'speech-ai'), 0, {
  id: 'android-customer', title: 'Android customer app: location, voice, notifications and storage',
  paragraphs: [
    'On Android, you can enter your delivery address manually. If you choose Use my current location and grant permission, Google Play services location and the Android address service help turn the reported approximate or precise location into a civic address. Address autocomplete sends the text you type, a Canada filter and a fixed Guelph-area search bias to Google Places. Google Maps displays delivery and driver locations during tracking. The app does not continuously track your handset location in the background or automatically attach device GPS coordinates to an order request. Your confirmed address is sent with an order and can be geocoded and retained by the backend for delivery operations.',
    'Google Maps and Places also process service requests, app/device/SDK metadata, IP addresses, SDK-specific identifiers and usage/error information to provide and improve their services. Collection depends on the SDK and feature. This is separate from website Google Analytics cookies: the inspected Android 1.0 (5) app does not include the Firebase Analytics or Crashlytics product SDK.',
    'Android voice ordering is optional. You can type, edit and review an order without it. The phone opens its selected speech-recognition provider, which receives microphone audio and may process it on its servers under its own privacy terms. Recognition is not guaranteed to remain on the phone. Speedy Sweeties receives the returned text and does not send an audio recording to its ordering backend or OpenAI. The transcript, recent Sweetie conversation and cart item names/quantities are processed as described in the OpenAI section below. Anything you say or enter in item text can contain personal information; avoid unnecessary sensitive or payment details.',
    'Android 1.0 (5) uses a microphone permission prompt and a text-only backend notice; it does not have the iPhone/iPad installation-wide OpenAI-consent setting. In Android versions that show Agree and speak / Not now, agreement is requested before each spoken request, before microphone permission or recognition. Not now or dismissing that disclosure leaves manual typing available. It does not create a persistent consent setting in My Details. Start Sweetie Over clears the local draft conversation, not submitted orders or provider records. Change microphone permission in device Settings to stop future microphone access. Cancelling cannot recall information already received by the speech provider, Speedy Sweeties or OpenAI.',
    'Android uses Firebase Cloud Messaging and Firebase Installations for notification registration and delivery. Firebase can generate an installation identifier even when notification display permission is denied. Android 1.0 (5) uses valid saved order access to replace or remove an eligible order notification destination. Permission denial does not delete all Firebase/provider records. Current customer notifications use generic update text, a non-secret order reference and event/freshness information, without customer contact details or tracking/access credentials. Opening protected tracking still requires valid app-held order access. Existing driver notifications are separate.',
    'Deletion removes eligible order notification associations and pending customer-specific navigation work. Already queued provider/OS notifications or delivered notifications cannot always be recalled; an old notification can remain visible after its associated tracking access becomes unavailable.',
    'On Android, profile, recent/favourite order, tracking and loyalty information is kept in the app private local storage. Privacy-access, verification and deletion-request records are encrypted with a key managed by Android Keystore. This does not mean every profile or tracking field is separately encrypted using Keystore. The app excludes its customer DataStore and privacy-credential preferences from cloud backup and device-transfer rules. Uninstalling, losing a key or using an incompatible signing identity can prevent local credential recovery; do not rely on reinstalling to preserve access.'
  ]
});
section('contact').links.push(
  ['Google privacy', 'https://policies.google.com/privacy'],
  ['Firebase privacy and security', 'https://firebase.google.com/support/privacy']
);
