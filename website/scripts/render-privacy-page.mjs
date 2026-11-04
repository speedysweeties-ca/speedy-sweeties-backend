// The homepage remains the published policy source so its existing fragment URL
// and the standalone page cannot drift into different statements.
import { createHash } from 'node:crypto';
import { canonicalOrigin } from './render-service-pages.mjs';
import { proposedPrivacyPolicy } from '../content/privacy-policy-proposed.mjs';

export const privacyPath = '/privacy-policy/';
const headings = new Map([
  ['Information We Collect', ['information-we-collect', 'Information we collect']],
  ['How We Use Your Information:', ['how-we-use-information', 'How we use your information']],
  ['Data Sharing:', ['service-providers', 'Service providers and data sharing']],
  ['Your Rights:', ['your-rights', 'Your rights']],
  ['Contact Us', ['contact-us', 'Contact us']]
]);
const listItems = new Set(['Name', 'Delivery address, including optional apartment/unit number and buzz code', 'Email', 'Phone Number']);
const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export function validateProposedPolicyPublication({ production = false, approved = false, publicationDate = '' } = {}) {
  if (!production) {
    if (publicationDate) throw new Error('A policy preview must not assign an effective date.');
    return;
  }
  if (!approved) throw new Error('Proposed policy publication requires separate approval and PUBLIC_CUSTOMER_PAGES_APPROVED=true.');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  // This exact policy was published on November 3. Unrelated site rebuilds
  // retain that date; changed policy content still needs today's explicit date.
  const unchangedPublishedPolicy = publicationDate === '2026-11-03' && publicationDate <= today &&
    createHash('sha256').update(JSON.stringify(proposedPrivacyPolicy)).digest('hex') ===
      '9ccee680c14fa75d27a220188ec847d01303b10326a15f9f15aed00f47a90631';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publicationDate) || (publicationDate !== today && !unchangedPublishedPolicy)) {
    throw new Error('Policy publication requires the actual Toronto publication date as --privacy-policy-date=YYYY-MM-DD. Rebuild if publication moves to another date.');
  }
}

export function proposedPolicyBlocks(options = {}) {
  validateProposedPolicyPublication(options);
  const date = options.production ? options.publicationDate : 'Not assigned — proposed policy; publication pending';
  return [
    `<strong>Effective Date:</strong> ${escape(date)}`,
    `<strong>Last updated:</strong> ${options.production ? escape(date) : 'Publication pending; this is a proposed replacement'}`,
    `<strong>Speedy Sweeties</strong> — ${escape(proposedPrivacyPolicy.introduction)}`,
    ...proposedPrivacyPolicy.sections.flatMap(section => [
      section.title, ...section.paragraphs.map(escape),
      ...(section.links ?? []).map(([label, url]) => `<a href="${escape(url)}" rel="noopener noreferrer">${escape(label)}</a>`)
    ])
  ];
}

export function replaceHomepagePolicy(homeHtml, options = {}) {
  const pattern = /(<span id="privacy-policy">[\s\S]*?<\/span>)[\s\S]*?(<\/div>)/g;
  if ([...homeHtml.matchAll(pattern)].length !== 1) throw new Error('Expected exactly one homepage privacy section; stop rather than replace unrelated content.');
  const body = proposedPolicyBlocks(options).join('<br>');
  return homeHtml.replace(pattern, (_match, beginning, end) => `${beginning}${body}${end}`);
}

export function proposedPolicyReviewText() {
  return [
    'PROPOSED REPLACEMENT — NOT PUBLISHED; NOT APPLE SUBMISSION APPROVAL',
    'Canonical URL: ' + canonicalOrigin + privacyPath,
    'Effective date: not assigned. Use the actual publication date only after approval.',
    '', proposedPrivacyPolicy.title, '', proposedPrivacyPolicy.introduction,
    ...proposedPrivacyPolicy.sections.flatMap(section => [
      '', section.title, '', ...section.paragraphs.flatMap(paragraph => [paragraph, '']),
      ...(section.links ?? []).map(([label, url]) => `${label}: ${url}`)
    ])
  ].join('\n').trim() + '\n';
}

export function renderPrivacyPage(homeHtml, { production = false, legacy = false, proposed = false, approved = false, publicationDate = '' } = {}) {
  if (proposed) validateProposedPolicyPublication({ production, approved, publicationDate });
  const sectionHeadings = proposed ? new Map(proposedPrivacyPolicy.sections.map(section => [section.title, [section.id, section.title]])) : headings;
  const match = homeHtml.match(/<span id="privacy-policy">[\s\S]*?<\/span>([\s\S]*?)<\/div>/);
  if (!match) throw new Error('The published homepage privacy section is missing.');
  const blocks = match[1].split(/<br\s*\/?>/i).map(block => block.replace(/\u200d/g, '').trim()).filter(Boolean);
  if (!blocks[0]?.startsWith('<strong>Effective Date:</strong>') ||
      !blocks[1]?.startsWith('<strong>Last updated:</strong>') ||
      !blocks[2]?.startsWith('<strong>Speedy Sweeties</strong>')) {
    throw new Error('Review the privacy-page renderer after changing the policy structure.');
  }
  const found = blocks.filter(block => sectionHeadings.has(block));
  if (found.length !== sectionHeadings.size || new Set(found).size !== sectionHeadings.size) {
    throw new Error('The published policy must contain every expected section once.');
  }
  let listing = false;
  const article = blocks.slice(2).map(block => {
    const close = listing && !listItems.has(block) ? '</ul>' : '';
    if (close) listing = false;
    if (sectionHeadings.has(block)) {
      const [id, title] = sectionHeadings.get(block);
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
  const toc = [...sectionHeadings.values()].map(([id, title]) => `<li><a href="#${id}">${title}</a></li>`).join('');
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
