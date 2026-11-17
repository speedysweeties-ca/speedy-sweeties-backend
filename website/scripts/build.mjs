import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { services } from '../content/services.mjs';
import { canonicalOrigin, renderServicePage } from './render-service-pages.mjs';
import { driverPath, renderDriverPage } from './render-driver-page.mjs';
import { privacyPath, renderPrivacyPage, replaceHomepagePolicy, validateProposedPolicyPublication } from './render-privacy-page.mjs';

function withPageCounter(html, page) {
  return html.replace('</head>', '<link rel="stylesheet" href="/assets/page-counter.css"></head>')
    .replace('</body>', `<div class="page-counter" data-page-counter="${page}" aria-live="polite">Page views: <span data-page-count>Loading…</span></div><script defer src="/js/page-counter.js"></script></body>`);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--production');
const android = process.argv.includes('--proposed-android-privacy-policy');
const proposed = android || process.argv.includes('--proposed-privacy-policy');
// A deployment-specific date can supersede an older date in Render's saved command.
const publicationDate = process.env.PUBLIC_PRIVACY_POLICY_DATE ?? process.argv.find(value => value.startsWith('--privacy-policy-date='))?.slice('--privacy-policy-date='.length) ?? '';
const policyOptions = { production, publicationDate, approved: process.env.PUBLIC_CUSTOMER_PAGES_APPROVED === 'true', android };
if (proposed) validateProposedPolicyPublication(policyOptions);
else if (publicationDate) throw new Error('A policy date requires --proposed-privacy-policy.');
const turnstileSiteKey = production ? (process.env.TURNSTILE_SITE_KEY ?? '').trim() : '';
if (production && (!/^0x[A-Za-z0-9_-]{10,80}$/.test(turnstileSiteKey) ||
    turnstileSiteKey === '0x4AAAAAAAQTptj2So4dx43e')) {
  throw new Error('Production requires an owner-held TURNSTILE_SITE_KEY; test and former Webflow keys are forbidden.');
}
await rm(root + 'dist', { recursive: true, force: true });
await mkdir(root + 'dist', { recursive: true });
await cp(root + 'src', root + 'dist', { recursive: true });
let html = await readFile(root + 'dist/index.html', 'utf8');
html = html.replace('<!--BUILD_ROBOTS-->', production ? '' : '<meta name="robots" content="noindex, nofollow">');
if (production) html = html.replace(/<aside id="preview-notice" hidden>[\s\S]*?<\/aside>\n?/, '');
if (proposed) html = replaceHomepagePolicy(html, policyOptions);
await writeFile(root + 'dist/index.html', withPageCounter(html, 'home'));
for (const [slug, legacy] of [['privacy-policy', false], ['privacy', true]]) {
  await mkdir(root + `dist/${slug}`, { recursive: true });
  await writeFile(root + `dist/${slug}/index.html`, renderPrivacyPage(html, { ...policyOptions, legacy, proposed }));
}
await mkdir(root + 'dist' + driverPath, { recursive: true });
await writeFile(root + 'dist' + driverPath + 'index.html', withPageCounter(renderDriverPage({ production }), 'drivers'));
for (const service of services) {
  await mkdir(root + `dist/${service.slug}`, { recursive: true });
  await writeFile(root + `dist/${service.slug}/index.html`, withPageCounter(renderServicePage(service, { production }), service.key));
}
// Overwrite formerly published resources explicitly: deleted paths can remain
// cached at the CDN. These notices offer no service and are not sitemap entries.
const retiredNotice = '<!doctype html>\n<html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Page no longer available | Speedy Sweeties</title></head><body><main><h1>This page is no longer available.</h1><p>This service information page has been retired.</p><p><a href="/">Visit the Speedy Sweeties homepage</a></p></main></body></html>\n';
for (const retired of ['vape-delivery-guelph', 'cannabis-delivery-guelph']) {
  await mkdir(root + `dist/${retired}`, { recursive: true });
  await writeFile(root + `dist/${retired}/index.html`, retiredNotice);
}
await writeFile(root + 'dist/js/site-config.js', `/* Generated at build time. Preview is the default. */
(() => {
  const production = ${production};
  const live = production && window.location.hostname === 'www.speedysweeties.ca';
  window.speedySite = Object.freeze({ live, turnstileSiteKey: ${JSON.stringify(turnstileSiteKey)} });
  if (!live && !document.querySelector('meta[name="robots"]')) {
    const robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
  }
})();
`);
await writeFile(root + 'dist/robots.txt', production
  ? 'User-agent: *\nAllow: /\nSitemap: https://www.speedysweeties.ca/sitemap.xml\n'
  : 'User-agent: *\nDisallow: /\n');
const sitemapUrls = [canonicalOrigin + '/', ...services.map(service => `${canonicalOrigin}/${service.slug}/`), canonicalOrigin + privacyPath, canonicalOrigin + driverPath];
await writeFile(root + 'dist/sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + sitemapUrls.map(url => `<url><loc>${url}</loc></url>`).join('') + '</urlset>\n');
console.log(`Built ${production ? 'production (live only on www.speedysweeties.ca)' : 'preview (no orders or analytics)'} into website/dist.`);
