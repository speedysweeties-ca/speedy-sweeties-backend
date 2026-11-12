// Review copy only. Ordinary builds continue to use the published homepage text.
// Keep operational unknowns in the internal handoff, not as customer-facing promises.
export const proposedPrivacyPolicy = {
  title: 'Speedy Sweeties — Website and Customer App Privacy',
  introduction: 'Speedy Sweeties, operated as RS Speedy Sweeties, uses information to arrange purchases and deliveries and provide customer service. This policy covers our website, the Speedy Sweeties Delivery app for iPhone and iPad, and their shared ordering backend. Robert Stubbings is responsible for privacy requests. Website-only features are identified below.',
  sections: [
    {
      id: 'customer-details', title: 'Customer details, orders and business use',
      paragraphs: [
        'The app saves your profile, delivery details, favourites and recent orders on your device for reuse. When you submit an order, the app or website sends your name, phone number, email, delivery address, optional apartment or unit and buzz code, requested items and quantities, payment-method choice, delivery instructions and other notes. The backend creates or links customer and order records, including order progress, receipts, loyalty information and technical access credentials.',
        'We use these records to arrange retailer-placed purchases and purchases made by drivers on your behalf, carry out deliveries, communicate about orders, handle customer service and maintain transaction records. Staff reports also use order and customer records to understand order volumes, repeat business, ordering channels, payment-method choices and business results. The backend supports customer follow-up analysis and preparation of draft messages using customer/contact details, order history and recorded consent or opt-out information. Preparing a draft is separate from sending a message. You can ask not to receive optional promotional communications.',
        'The customer app and website ask for your payment-method choice, not payment-card numbers, security codes or bank-account details. Do not put these details, passwords, government identification or unnecessary personal information into item descriptions, voice requests or other free-text fields. An order request may itself reveal sensitive personal information.'
      ]
    },
    {
      id: 'order-sharing', title: 'Dispatch, drivers and retailers',
      paragraphs: [
        'Authorized dispatch staff can access customer profiles and order information. Assigned drivers receive the contact, delivery, item, instruction and order/receipt information needed for the delivery, as well as technical order identifiers. We provide retailers with the shopping list. A retailer that took your purchase separately may already hold information you gave it.',
        'We do not sell or rent customer contact details or provide them to another company for its own marketing. Service-provider processing, website analytics and our own business reporting are described separately.'
      ]
    },
    {
      id: 'location', title: 'Addresses, location and notifications',
      paragraphs: [
        'You can enter a delivery address manually. If you choose location assistance and grant permission, Apple location and address services help fill it in. The customer app does not continuously track your location in the background or attach your device GPS coordinates to an order request. The address you confirm is still sent with the order.',
        'The backend supports Google Maps/Places for address lookup, geocoding, routing, retailer hours and delivery operations. These services may receive an address or location needed for the relevant function, and the backend may retain geocoded delivery coordinates.',
        'If you permit notifications, Apple Push Notification service and Firebase Cloud Messaging process device registration and delivery information. An order can include the app notification token for delivery updates. Delivery systems can send order references, progress and notification content. Some driver notifications can contain order, customer or delivery details; previews may be visible on your device or a driver\'s device. You can turn notifications off in device Settings and continue using manual app navigation.'
      ]
    },
    {
      id: 'speech-ai', title: 'Optional Apple speech recognition and OpenAI',
      paragraphs: [
        'You can type and review an order without voice ordering or OpenAI voice-ordering consent. Voice ordering asks you to agree to the OpenAI disclosure before the app sends a voice-draft request. Apple microphone and speech-recognition permissions are separate from that agreement.',
        'Apple speech recognition turns microphone audio into text. Processing may occur on the device or on Apple servers, depending on device support. The customer app does not send an audio recording to the ordering backend or OpenAI.',
        'If you agree and finish your speech, the app sends the transcript, up to eight recent user/assistant messages in your Sweetie conversation, and the names and quantities of items already in your cart to the Speedy Sweeties backend. OpenAI interprets this information to prepare or update a draft. Requested product names may also be sent to OpenAI for searches restricted to approved retailer websites. Product lookup uses a Guelph, Ontario search context rather than your device GPS location, and verified product information can be saved in the catalogue.',
        'The app does not automatically attach your saved contact details or delivery address to this voice-draft request. Anything you say or put in conversation or item text can nevertheless contain personal information and be included. Review the draft before submitting: voice ordering does not automatically place an order.',
        'Our voice-ordering integration asks OpenAI not to store the response. This does not establish zero retention or disable every provider log. OpenAI has separate data-handling, logging and account controls. We do not promise special zero-retention approval or Canada-only processing.'
      ]
    },
    {
      id: 'choices', title: 'Consent, cancellation and your choices',
      paragraphs: [
        'Choose Not now to decline voice ordering and continue manually. Account lets you withdraw voice-ordering consent. The app records this choice on that installation. Withdrawal stops future voice requests from that app and cancels pending local work; stale results are discarded rather than applied to your cart.',
        'Cancelling or withdrawing cannot retract information already received by Speedy Sweeties, Apple or OpenAI. It does not delete a submitted order or change consent on another installation. You can separately change microphone, speech, location and notification permissions in device Settings.'
      ]
    },
    {
      id: 'providers-storage', title: 'Storage, providers and processing locations',
      // Robert adopted this standard and confirmed accepted coverage for all
      // current independent drivers on November 3, 2026; records remain private.
      // This is owner-provided evidence, not independent verification of behavior.
      paragraphs: [
        'We require third parties receiving personal information from our app to provide protection at least equivalent to the protections described in this policy and required by Apple’s App Review Guidelines. We use applicable service agreements and privacy terms to support this requirement, including protections concerning permitted use, confidentiality, security and handling privacy requests. Some providers also process information for their own disclosed purposes and retain records as described in this policy. Removing a record from our database does not itself erase every provider or backup copy.',
        'The app stores profile/history information locally and uses Apple Keychain for order and privacy-access credentials. HTTPS protects service requests in transit. Customer and order records are also stored in our PostgreSQL database on Render. The ordering API is hosted in Ohio, United States; processing is not limited to Canada.',
        'Apple, Google/Firebase and OpenAI process information for the features described above. Resend handles operational alert emails to a staff mailbox; alert content can include order references and a dispatcher link. Operational logs can contain order references, service metadata and delivery/error information.',
        "The account-deletion verification process uses Resend for an eligible email address. A verification provider receives the destination, verification/message content and transaction metadata. For the normal credential-backed process, the server selects the contact from the records bound to those credentials. If those credentials are unavailable, Robert must first review evidence linking you to the records before authorizing the temporary, request-only email verification route. Control of a newly supplied email address alone does not prove ownership of past records. Phone verification is not currently enabled.",
        'Resend documents United States storage separately from sending region. The Twilio integration uses its default United States API region. Provider delivery, fraud-prevention, security and backup records have separate handling. Cancelling a verification or removing a local record does not itself erase provider or carrier records. We do not claim exclusive processing locations or a single deletion deadline for all providers.',
        'AWS S3 is used for the enrolled privacy-recovery journal. Its purpose is to preserve minimized recovery history needed to reconcile deletion decisions and access revocations after a database restoration. It is separate from the live customer/order database and is not an additional shopping-list or voice-recording archive. Completed enrollment does not mean customer deletion is enabled or that a real customer restoration has been completed.'
      ]
    },
    {
      id: 'retention', title: 'Retention and eligible deletion',
      paragraphs: [
        'Device data, live backend records, financial evidence, logs, mailboxes and provider/backup copies are separate. Removing the app, clearing local information or withdrawing voice consent does not itself delete backend customer/order records or provider copies. Records are kept for service, record-keeping and justified legal needs, with their purpose and applicable retention reviewed when handling a verified request. There is no single fixed expiry for every record and no automatic two-year inactive-profile deletion rule.',
        'Our adopted retention procedure calls for removing eligible customer profiles, preferences, loyalty information, copied contact/address/geocode details, delivery instructions and app access following identity and scope review. Restricted receipt and supporting transaction evidence is generally retained for six years after the end of the last tax year it relates to. Our fiscal year ends December 31. An applicable legal or dispute hold can require longer retention.',
        'Restricted financial evidence includes order/receipt identifiers and dates, payment method and final status, item descriptions, quantities and prices, recognized receipt-charge facts and item/delivery/tax-or-fee/grand totals. Financial retention is not a reason to retain every customer profile, contact or marketing field. Retained financial records are restricted to their justified purposes, rather than marketing or recreating a deleted profile.',
        'Receipts from before the current digital-receipt dispatcher remain paper records; we do not assume they were scanned into the system. Minimized privacy-request/audit evidence is first reviewed 24 calendar months after actual request closure. A keyed anti-reactivation identifier is first reviewed 24 calendar months after the database erasure that creates it. These are review dates, not automatic deletion dates or minimum retention periods. Extensions require a reason and another review date.',
        'For a verified request, the adopted procedure calls for assessing separately held records and explaining eligible removal and any information retained, its purpose and the applicable review or expiry. Deleting a live record does not automatically delete backups, exports or provider records. We do not promise immediate erasure of every such copy. A restoration must account for later deletion decisions before restored customer information is used; a backup alone does not provide that protection.'
      ]
    },
    {
      id: 'requests', title: 'Access, correction and deletion requests',
      paragraphs: [
        'Contact Robert using the privacy contact below to request access, correction or deletion, or to ask about retention. You do not need to place another order. Provide your own name and a safe way to reply; an order/receipt reference can help locate records but is not proof of ownership. Do not send passwords, payment details, government identification or another person\'s information in an initial message.',
        'Robert has adopted a five-step procedure: receive and record the request; verify identity proportionately; locate records and fulfill access, correction or eligible deletion; document information retained and its justification; verify and explain the outcome. A newly supplied phone/email or current control of a contact does not grant unrelated historical records. Ownership conflicts or lost credentials require private review.',
        "You can initiate an eligible deletion request in the app, review its status and cancel while the request is still cancellable. Verification alone does not submit a request: you must explicitly confirm it. If you cannot use your saved credentials, contact Robert for a private ownership review; you do not need to place another order. Following ownership and scope review, Robert uses the guarded deletion process to remove eligible information and account access. Information with a justified retention requirement is handled as described above. Completion is confirmed only after the applicable separately held and provider copies have supported removal, justified retention or documented expiry outcomes; submitting a request is not confirmation of completion.",
        'Our normal target is completion within 30 calendar days after identity verification. This is not a promise of immediate or automatic erasure. Ownership disputes, active deliveries or applicable holds may require more time or a separately explained outcome. We explain completed actions, outstanding work and any information retained, including the reason and applicable review or expiry.'
      ]
    },
    {
      id: 'website', title: 'Website analytics, bot checks and browser storage',
      paragraphs: [
        'If you use the website driver-application form, it prepares an email draft using your name, phone, email, city or area, vehicle access, whether you hold a valid driver’s licence, Smart Serve certificate number, availability and optional experience or questions. The form does not automatically send an application; you review the prepared text and send it from your email app. We use information you choose to send to assess driving opportunities and contact you. Do not include your driver’s licence number, ID photos, banking details or full home address.',
        'Our main website and service landing pages use Google Analytics cookies and similar identifiers to understand visits, approximate location, browser/device type, referral sources, scrolling and outbound-link activity. Custom events describe starting an order, receiving an acknowledgement and clicking contact links; service-page events can include the service category and destination type. These custom events do not send the names, contacts, addresses, order contents or other form-field values you enter. You can manage or delete cookies through your browser settings.',
        'To understand which sources lead to fulfilled deliveries, the website keeps broad traffic-source and entry-page categories in this tab’s session storage for up to 30 minutes, with expired storage removed while the page is active or on the next visit. These categories are included with an order you submit and retained with the order under our record-handling procedure. Full referring addresses, search terms, advertising click identifiers and Google Analytics visitor identifiers are not copied into these order fields. Attribution is approximate; missing or expired source information remains unknown.',
        'Cloudflare Turnstile checks website submissions for automated activity. Our backend verification sends the Turnstile token without order-form field values. The browser widget also processes technical signals such as IP address, browser and connection characteristics; Cloudflare can use them to improve bot detection. These checks are separate from app AI consent and are not online age or identity verification.',
        'Service-page age acknowledgement stores only an adult acknowledgement in session storage for that tab, not a birth date. Browser tracking can save up to five private tracking tokens, order numbers and saved times. Records expire after 48 hours and are removed while the page is active or on your next visit. Keep tracking links private: someone with a valid link can view associated tracking information.',
        'Forget this order on this browser removes that browser\'s saved record; it does not cancel an order, revoke a copied link or delete backend records. Clearing website storage can also remove the age acknowledgement. The browser\'s 48-hour storage period is not the retention period for app/backend orders.'
      ]
    },
    {
      id: 'contact', title: 'Privacy contact and provider information',
      paragraphs: [
        'Robert Stubbings, RS Speedy Sweeties. Email: speedysweeties@hotmail.com. Phone: 519-826-8097. Contact us with privacy questions or requests; we will establish an appropriate private channel where further information is needed.',
        'Opening another service also involves its own privacy practices. Provider information is available from the links below. Those descriptions do not establish every setting of the account used by Speedy Sweeties.'
      ],
      links: [
        ['Email the privacy contact', 'mailto:speedysweeties@hotmail.com'],
        ['Call the privacy contact', 'tel:5198268097'],
        ['Apple privacy', 'https://www.apple.com/legal/privacy/'],
        ['OpenAI API data controls', 'https://developers.openai.com/api/docs/guides/your-data'],
        ['Google partner-site information', 'https://policies.google.com/technologies/partner-sites'],
        ['Cloudflare Turnstile privacy', 'https://www.cloudflare.com/turnstile-privacy-policy/'],
        ['Resend data handling', 'https://resend.com/security/gdpr'],
        ['Twilio privacy', 'https://www.twilio.com/en-us/legal/privacy'],
        ['Render privacy', 'https://render.com/privacy'],
        ['AWS privacy', 'https://aws.amazon.com/privacy/']
      ]
    }
  ]
};
