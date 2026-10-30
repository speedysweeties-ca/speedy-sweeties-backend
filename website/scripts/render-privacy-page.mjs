// The homepage remains the published policy source so its existing fragment URL
// and the standalone page cannot drift into different statements.
import { canonicalOrigin } from './render-service-pages.mjs';

export const privacyPath = '/privacy-policy/';
const headings = new Map([
  ['Information We Collect', ['information-we-collect', 'Information we collect']],
  ['How We Use Your Information:', ['how-we-use-information', 'How we use your information']],
  ['Data Sharing:', ['service-providers', 'Service providers and data sharing']],
  ['Your Rights:', ['your-rights', 'Your rights']],
  ['Contact Us', ['contact-us', 'Contact us']]
]);
const listItems = new Set(['Name', 'Delivery address, including optional apartment/unit number and buzz code', 'Email', 'Phone Number']);

export function renderPrivacyPage(homeHtml, { production = false, legacy = false } = {}) {
  const match = homeHtml.match(/<span id="privacy-policy">[\s\S]*?<\/span>([\s\S]*?)<\/div>/);
  if (!match) throw new Error('The published homepage privacy section is missing.');
  const blocks = match[1].split(/<br\s*\/?>/i).map(block => block.replace(/\u200d/g, '').trim()).filter(Boolean);
  if (!blocks[0]?.startsWith('<strong>Effective Date:</strong>') ||
      !blocks[1]?.startsWith('<strong>Last updated:</strong>') ||
      !blocks[2]?.startsWith('<strong>Speedy Sweeties</strong>')) {
    throw new Error('Review the privacy-page renderer after changing the policy structure.');
  }
  const found = blocks.filter(block => headings.has(block));
  if (found.length !== headings.size || new Set(found).size !== headings.size) {
    throw new Error('The published policy must contain every expected section once.');
  }
  let listing = false;
  const article = blocks.slice(2).map(block => {
    const close = listing && !listItems.has(block) ? '</ul>' : '';
    if (close) listing = false;
    if (headings.has(block)) {
      const [id, title] = headings.get(block);
      return `${close}<h2 id="${id}">${title}</h2>`;
    }
    if (listItems.has(block)) {
      const open = listing ? '' : '<ul>';
      listing = true;
      return `${open}<li>${block}</li>`;
    }
    return `${close}<p>${block}</p>`;
  }).join('\n') + (listing ? '</ul>' : '');
  const url = canonicalOrigin + privacyPath;
  const toc = [...headings.values()].map(([id, title]) => `<li><a href="#${id}">${title}</a></li>`).join('');
  return `<!doctype html>
<html lang="en-CA"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${!production ? '<meta name="robots" content="noindex, nofollow">' : legacy ? '<meta name="robots" content="noindex, follow">' : ''}
<title>Privacy Policy | Speedy Sweeties</title>
<meta name="description" content="Read how Speedy Sweeties handles personal information, website analytics, order tracking, service providers and privacy requests.">
<link rel="canonical" href="${url}"><meta property="og:url" content="${url}">
<meta property="og:type" content="website"><meta property="og:title" content="Privacy Policy | Speedy Sweeties">
<link rel="icon" href="/assets/e01b881a93044127.png">
<link rel="stylesheet" href="/assets/service-pages.css"><link rel="stylesheet" href="/assets/privacy-page.css">
<script defer src="/js/site-config.js"></script>
</head><body>
<a class="skip-link" href="#main">Skip to privacy policy</a>
<header class="site-header"><a class="brand" href="/" aria-label="Speedy Sweeties home"><img src="/assets/25c552ab2c1f317e.jpg" width="483" height="144" alt="Speedy Sweeties delivery services"></a><nav aria-label="Page navigation"><a class="header-home" href="/">Main website <span aria-hidden="true">↗</span></a></nav></header>
<main id="main" class="policy-main section-width">
<header class="policy-intro"><p class="eyebrow">SPEEDY SWEETIES · GUELPH, ONTARIO</p><h1>Privacy Policy</h1><p class="policy-dates">${blocks[0]}<br>${blocks[1]}</p></header>
<div class="policy-layout"><nav class="policy-toc" aria-label="On this page"><h2>On this page</h2><ol>${toc}</ol></nav><article class="policy-copy" aria-label="Privacy policy">${article}</article></div>
</main>
<footer class="site-footer section-width"><a class="footer-brand" href="/">SPEEDY SWEETIES<span>Local delivery. Guelph, Ontario.</span></a><div class="footer-bottom"><span>© ${new Date().getUTCFullYear()} Speedy Sweeties.</span><a href="/#contact-us">Contact Speedy Sweeties</a><a href="/">Back to the main website <span aria-hidden="true">↗</span></a></div></footer>
</body></html>\n`;
}
