import { services } from '../content/services.mjs';

export const canonicalOrigin = 'https://www.speedysweeties.ca';
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const hrefs = { order: '/#contact-us', home: '/', services: '/#services' };
const arrow = '<span aria-hidden="true">↗</span>';
const serviceLinks = current => services.map(s => `<a href="/${s.slug}/"${s.key === current ? ' aria-current="page"' : ''}>${escape(s.short)}</a>`).join('');

export function renderServicePage(service, { production = false } = {}) {
  const s = service;
  const url = `${canonicalOrigin}/${s.slug}/`;
  const metadata = {
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebPage', '@id': url + '#page', url, name: s.title, description: s.description, inLanguage: 'en-CA',
        isPartOf: { '@type': 'WebSite', '@id': canonicalOrigin + '/#website', name: 'Speedy Sweeties', url: canonicalOrigin + '/' },
        about: { '@type': 'Organization', name: 'Speedy Sweeties', url: canonicalOrigin + '/' } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Speedy Sweeties', item: canonicalOrigin + '/' },
        { '@type': 'ListItem', position: 2, name: s.label, item: url }
      ] }
    ]
  };
  const visual = s.image
    ? '<img class="hero-mascot" src="/assets/3b95ab0e3e6a5c91.jpg" width="542" height="1066" alt="Speedy Sweeties’ red bottle mascot wearing sunglasses and running shoes">'
    : `<div class="hero-symbol" aria-hidden="true"><svg viewBox="0 0 200 200" fill="none"><circle cx="100" cy="100" r="86" stroke="currentColor" stroke-width="2"/>${s.key === 'convenience' ? '<path d="M60 79h80l10 70H50l10-70Zm20 0V62a20 20 0 0 1 40 0v17" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="m85 110 12 12 23-27" stroke="currentColor" stroke-width="5"/>' : '<path d="M100 44c-25 0-44 20-44 44 0 33 44 67 44 67s44-34 44-67c0-24-19-44-44-44Z" stroke="currentColor" stroke-width="5"/><circle cx="100" cy="87" r="15" stroke="currentColor" stroke-width="5"/>'}</svg><span>${s.key === 'convenience' ? 'THE EXTRAS.<br>WITHOUT THE ERRAND.' : 'LOCAL INFORMATION.<br>CLEAR REQUIREMENTS.'}</span></div>`;
  return `<!doctype html>
<html lang="en-CA"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${production ? '' : '<meta name="robots" content="noindex, nofollow">'}
<title>${escape(s.title)}</title><meta name="description" content="${escape(s.description)}">
<link rel="canonical" href="${url}"><meta property="og:url" content="${url}">
<meta property="og:type" content="website"><meta property="og:locale" content="en_CA">
<meta property="og:title" content="${escape(s.title)}"><meta property="og:description" content="${escape(s.description)}">
<meta property="og:image" content="${canonicalOrigin}/assets/social-preview.png"><meta property="og:image:alt" content="Speedy Sweeties — local delivery in Guelph">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(s.title)}"><meta name="twitter:description" content="${escape(s.description)}"><meta name="twitter:image" content="${canonicalOrigin}/assets/social-preview.png">
<link rel="icon" href="/assets/e01b881a93044127.png"><link rel="stylesheet" href="/assets/service-pages.css">
<script type="application/ld+json">${JSON.stringify(metadata).replace(/</g, '\\u003c')}</script>
<script src="/js/site-config.js"></script><script src="/js/tracking-link.js"></script><script src="/js/analytics.js"></script>
<script src="/js/service-pages.js" defer></script>
</head><body data-service="${s.key}">
<div id="service-content" inert>
<a class="skip-link" href="#main">Skip to content</a>
<aside class="preview-banner" id="landing-preview" hidden>Website preview · <strong>No orders are accepted here.</strong> <a href="${canonicalOrigin}/">Visit the live website</a></aside>
<header class="site-header"><a class="brand" href="/" aria-label="Speedy Sweeties home"><img src="/assets/25c552ab2c1f317e.jpg" width="483" height="144" alt="Speedy Sweeties delivery services"></a><nav aria-label="Page navigation"><a href="#details">The details</a><a href="#questions">Questions</a><a class="header-home" href="/" data-landing-destination="home">Main website ${arrow}</a></nav></header>
<main id="main">
<section class="hero" aria-labelledby="page-title"><div class="hero-copy"><p class="eyebrow">${escape(s.eyebrow)}</p><h1 id="page-title">${escape(s.heading).replace(/\n/g, '<br>')}</h1><p class="hero-intro">${escape(s.intro)}</p><div class="actions"><a class="button button-red" href="${hrefs[s.destination]}" data-landing-destination="${s.destination}">${escape(s.cta)} ${arrow}</a>${s.destination === 'order' ? '<a class="text-link" href="tel:+15198268097" data-landing-destination="phone">Call 519-826-8097</a>' : ''}</div><p class="hero-footnote">${s.destination === 'order' ? 'Your request goes through our main website’s secure order form.' : 'Service information for adults. No products are sold on this page.'}</p></div><div class="hero-art">${visual}<div class="local-stamp"><span>GUELPH</span><strong>LOCAL<br>DELIVERY.</strong><span>Since 2006</span></div></div></section>
<div class="trust-strip"><span>GUELPH, ONTARIO</span><span>LOCALLY SERVING YOU SINCE 2006</span><a href="/#rates">CURRENT RATES ${arrow}</a></div>
<section class="detail-section section-width" id="details"><div><p class="eyebrow">${s.destination === 'order' ? 'A LITTLE LESS RUNNING AROUND' : 'GOOD TO KNOW'}</p><h2>${escape(s.detailTitle)}</h2></div><div><p class="body-copy">${escape(s.detail)}</p><ul class="highlights">${s.highlights.map(h=>`<li><span aria-hidden="true">✓</span>${escape(h)}</li>`).join('')}</ul>${s.reference ? `<a class="text-link" href="${s.reference.url}">${escape(s.reference.label)} ${arrow}</a>` : ''}</div></section>
<section class="steps-section"><div class="section-width"><div class="section-heading"><p class="eyebrow">${s.destination === 'order' ? 'FROM REQUEST TO YOUR DOOR' : 'BEFORE YOU CONTINUE'}</p><h2>${s.destination === 'order' ? 'Keep it simple.' : 'Start with the facts.'}</h2></div><ol class="steps">${s.steps.map((step,i)=>`<li><span class="step-number">0${i+1}</span><p>${escape(step)}</p></li>`).join('')}</ol><p class="service-note">${escape(s.note)}</p></div></section>
<section class="faq-section section-width" id="questions"><div><p class="eyebrow">A FEW HELPFUL ANSWERS</p><h2>Before you go.</h2></div><div class="faq-list">${s.questions.map(([q,a])=>`<details><summary>${escape(q)}<span aria-hidden="true">+</span></summary><p>${escape(a)}</p></details>`).join('')}</div></section>
<section class="closing-cta section-width"><div><p class="eyebrow">SPEEDY SWEETIES · GUELPH</p><h2>${s.destination === 'order' ? 'Ready when you are.' : 'Get to know your local delivery team.'}</h2><p>${s.destination === 'order' ? 'Check today’s hours and rates, then send your request.' : 'Explore the services and information on our main website.'}</p></div><a class="button button-light" href="${hrefs[s.destination]}" data-landing-destination="${s.destination}">${escape(s.cta)} ${arrow}</a></section>
</main><footer class="site-footer section-width"><a class="footer-brand" href="/">SPEEDY SWEETIES<span>Local delivery. Guelph, Ontario.</span></a><nav aria-label="Delivery service pages">${serviceLinks(s.key)}</nav><div class="footer-bottom"><span>© ${new Date().getUTCFullYear()} Speedy Sweeties.</span><a href="/#privacy-policy">Privacy information</a><a href="/">Back to the main website ${arrow}</a></div></footer>
</div>
<dialog id="age-gate" open aria-modal="true" aria-labelledby="age-title" aria-describedby="age-description"><div class="age-card"><p class="eyebrow">WELCOME TO SPEEDY SWEETIES</p><div id="age-question"><span class="age-number" aria-hidden="true">19+</span><h2 id="age-title">Are you 19 or older?</h2><p id="age-description">These service pages are for adults aged 19 and over. Please confirm your age to continue.</p><div class="age-actions"><button class="button button-red" id="age-yes" type="button">Yes, I’m 19+</button><button class="button button-outline" id="age-no" type="button">No, I’m under 19</button></div><p class="age-fine-print">This is a self-declaration. Valid ID and eligibility checks still apply to age-restricted deliveries.</p></div><div id="age-declined" hidden><h2 id="age-declined-title" tabindex="-1">These pages are for adults.</h2><p>You must be at least 19 to continue. Please close this page.</p><button class="text-link" id="age-back" type="button">I selected the wrong answer</button></div><noscript><p>JavaScript is needed to use this age confirmation.</p></noscript></div></dialog>
</body></html>\n`;
}
