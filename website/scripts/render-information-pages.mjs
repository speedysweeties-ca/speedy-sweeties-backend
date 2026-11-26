import { canonicalOrigin } from './render-service-pages.mjs';

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export function renderInformationPage(page, { production = false } = {}) {
  const url = `${canonicalOrigin}/${page.slug}/`;
  return `<!doctype html>
<html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}">
${production ? '' : '<meta name="robots" content="noindex, nofollow">'}
<link rel="canonical" href="${escape(url)}">
<link rel="stylesheet" href="/assets/service-pages.css"><link rel="stylesheet" href="/assets/privacy-page.css">
</head><body>
<a class="skip-link" href="#main">Skip to information</a>
${production ? '' : '<aside class="preview-banner">Preview — not published</aside>'}
<header class="site-header"><span class="eyebrow">Speedy Sweeties · Public information</span><nav aria-label="Information"><a href="#official-sources">Official sources</a></nav></header>
<main id="main" class="policy-main section-width">
<div class="policy-intro"><p class="eyebrow">Ontario · Age and identification</p><h1>${escape(page.heading)}</h1><p>${escape(page.introduction)}</p><p class="policy-dates">Information reviewed <time datetime="2026-11-26">November 26, 2026</time></p></div>
<div class="policy-layout"><nav class="policy-toc" aria-label="On this page"><h2>On this page</h2><ol>${page.sections.map(section => `<li><a href="#${escape(section.id)}">${escape(section.title)}</a></li>`).join('')}<li><a href="#official-sources">Official sources</a></li></ol></nav>
<article class="policy-copy">${page.sections.map(section => `<section aria-labelledby="${escape(section.id)}"><h2 id="${escape(section.id)}">${escape(section.title)}</h2><p>${escape(section.text)} <a href="#source-${section.source + 1}" aria-label="See official source ${section.source + 1}">[${section.source + 1}]</a></p></section>`).join('')}
<section aria-labelledby="official-sources"><h2 id="official-sources">Official Ontario sources</h2><ol>${page.sources.map((source, index) => `<li id="source-${index + 1}"><a href="${escape(source.url)}" rel="noopener noreferrer">${escape(source.label)}</a></li>`).join('')}</ol><p>This is a general summary, not legal advice. Refer to the official sources for the complete rules and later changes.</p></section>
</article></div></main>
<footer class="site-footer section-width"><p>© ${new Date().getUTCFullYear()} Speedy Sweeties · Public information</p></footer>
</body></html>\n`;
}
