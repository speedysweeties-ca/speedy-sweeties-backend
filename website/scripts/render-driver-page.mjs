export const driverPath = '/drive-with-us/';

export function renderDriverPage({ production = false } = {}) {
  return `<!doctype html>
<html lang="en-CA"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${production ? '' : '<meta name="robots" content="noindex, nofollow">'}
<title>Drive with Speedy Sweeties | Guelph Driver Application</title>
<meta name="description" content="Join the Speedy Sweeties delivery team in Guelph. Independent contractor opportunities: $6 per delivery, 100% of tips, $2.50 per extra stop and weekly pay. Apply by email.">
<link rel="canonical" href="https://www.speedysweeties.ca/drive-with-us/">
<meta property="og:title" content="Your city. Your wheels. Join Speedy Sweeties.">
<meta property="og:description" content="Drive locally in Guelph. $6 per delivery, 100% of tips and weekly pay. Apply by email.">
<meta property="og:type" content="website"><meta property="og:url" content="https://www.speedysweeties.ca/drive-with-us/">
<meta property="og:image" content="https://www.speedysweeties.ca/assets/social-preview.png">
<link rel="icon" href="/assets/e01b881a93044127.png">
<link rel="stylesheet" href="/assets/service-pages.css"><link rel="stylesheet" href="/assets/driver-page.css">
<script src="/js/site-config.js"></script><script src="/js/driver-application.js" defer></script>
</head><body>
<a class="skip-link" href="#main">Skip to driver application</a>
<header class="site-header"><a class="brand" href="/" aria-label="Speedy Sweeties home"><img src="/assets/25c552ab2c1f317e.jpg" width="483" height="144" alt="Speedy Sweeties"></a><nav aria-label="Page navigation"><a href="#apply">Apply now</a><a class="header-home" href="/">Main website ↗</a></nav></header>
<main id="main">
<section class="driver-hero section-width"><p class="eyebrow">DRIVE WITH SPEEDY SWEETIES · GUELPH</p><h1>Your city.<br>Your wheels.<br>Our team.</h1><p class="hero-intro">Know your way around Guelph? Help keep the good stuff moving. We’re looking for dependable, friendly drivers to join our local delivery team.</p><a class="button button-red" href="#apply">Start my application ↗</a><p class="driver-note">Independent contractor opportunity. Deliveries and earnings vary; no guaranteed hours or income.</p></section>
<section class="driver-pay section-width" aria-label="Driver compensation"><div><strong>$6</strong><span>per delivery</span></div><div><strong>100%</strong><span>of your tips</span></div><div><strong>$2.50</strong><span>per extra stop</span></div><div><strong>Weekly</strong><span>pay</span></div></section>
<section class="detail-section section-width"><div><p class="eyebrow">LOCAL ROADS. REAL PEOPLE.</p><h2>Bring your reliability.<br>And your wheels.</h2></div><div><p class="body-copy">Pick up customers’ orders, deliver with care and stay in touch with dispatch along the way.</p><ul class="highlights"><li>A valid driver’s licence and access to a reliable vehicle</li><li>Insurance appropriate for delivery work</li><li>A smartphone and mobile data</li><li>Friendly service, clear communication and dependable availability</li></ul><p class="driver-note">Tell us about your availability below. We’ll discuss the work, requirements and next steps with suitable applicants.</p></div></section>
<section id="apply" class="driver-application section-width"><div><p class="eyebrow">LET’S GET TO KNOW YOU</p><h2>Take the first turn.</h2><p>Complete the details below to prepare your application email. You’ll review it and press Send in your email app.</p><p><strong>This form does not submit an application directly.</strong> No email is sent until you send it yourself.</p><p>We use the application information you send to review your suitability and contact you about driving opportunities. Please don’t include driver’s licence numbers, ID photos, banking information or your full home address. <a href="/privacy-policy/">Read our Privacy Policy.</a></p></div>
<div><form id="driver-application" action="/drive-with-us/#apply" method="get">
<fieldset id="application-fields" disabled><legend>Your application details</legend>
<div class="driver-fields">
<label for="applicant-name">Full name<input id="applicant-name" autocomplete="name" required maxlength="80"></label>
<label for="applicant-phone">Phone number<input id="applicant-phone" type="tel" autocomplete="tel" required maxlength="30"></label>
<label for="applicant-email">Email address<input id="applicant-email" type="email" autocomplete="email" required maxlength="120"></label>
<label for="applicant-city">City or area<input id="applicant-city" autocomplete="address-level2" required maxlength="80"></label>
<label for="applicant-vehicle">Vehicle access<select id="applicant-vehicle" required><option value="">Choose one</option><option>Yes, I have access to a reliable vehicle</option><option>Not currently</option></select></label>
<label for="applicant-licence">Valid driver’s licence<select id="applicant-licence" required><option value="">Choose one</option><option>Yes</option><option>No</option></select></label>
<label class="full" for="applicant-smartserve">Smart Serve number (required)<input id="applicant-smartserve" type="text" required maxlength="80" pattern=".*\\S.*" aria-describedby="smartserve-help"><span id="smartserve-help">Enter your Smart Serve certificate number. This field cannot be left blank.</span></label>
<label class="full" for="applicant-availability">When are you available?<textarea id="applicant-availability" required maxlength="400" rows="3" placeholder="Days, evenings, weekends — tell us what works for you."></textarea></label>
<label class="full" for="applicant-experience">Anything else we should know? (optional)<textarea id="applicant-experience" maxlength="500" rows="3" placeholder="Delivery experience, familiarity with Guelph, or questions for us."></textarea></label>
</div>
<label class="driver-consent"><input id="applicant-consent" type="checkbox" required> I understand this is an independent contractor opportunity and that Speedy Sweeties may contact me about my application.</label>
<button class="button button-red" type="submit">Prepare application email ↗</button>
</fieldset></form>
<noscript><p>JavaScript is needed to prepare the email here. You can apply directly using the email address below.</p></noscript>
<p id="application-status" role="status" aria-live="polite"></p>
<div id="application-review" hidden><h3>Your application email</h3><p>Review the text, then open your email app. If no app opens, copy the text into a new email addressed to <strong>speedysweeties@hotmail.com</strong> with the subject <strong>Driver application — Speedy Sweeties</strong>.</p><label for="application-copy">Email text<textarea id="application-copy" readonly rows="12"></textarea></label><a id="application-email" class="button button-red">Open my email app ↗</a><p><strong>Remember to press Send in your email app.</strong> This page cannot confirm delivery of your email.</p></div>
<p class="driver-fallback">Prefer to apply directly? Email <a href="mailto:speedysweeties@hotmail.com?subject=Driver%20application%20%E2%80%94%20Speedy%20Sweeties">speedysweeties@hotmail.com</a> with your name, phone number, city, vehicle access, Smart Serve number and availability. Questions? Call <a href="tel:+15198268097">519-826-8097</a>.</p>
</div></section></main>
<footer class="site-footer section-width"><a class="footer-brand" href="/">SPEEDY SWEETIES<span>Local delivery. Guelph, Ontario.</span></a><div class="footer-bottom"><a href="/privacy-policy/">Privacy Policy</a><a href="/">Back to the main website ↗</a></div></footer>
</body></html>\n`;
}
