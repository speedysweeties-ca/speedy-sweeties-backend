import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { services } from '../content/services.mjs';
import { canonicalOrigin, renderServicePage } from './render-service-pages.mjs';
import { privacyPath, renderPrivacyPage } from './render-privacy-page.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--production');
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
await writeFile(root + 'dist/index.html', html);
for (const [slug, legacy] of [['privacy-policy', false], ['privacy', true]]) {
  await mkdir(root + `dist/${slug}`, { recursive: true });
  await writeFile(root + `dist/${slug}/index.html`, renderPrivacyPage(html, { production, legacy }));
}
for (const service of services) {
  await mkdir(root + `dist/${service.slug}`, { recursive: true });
  await writeFile(root + `dist/${service.slug}/index.html`, renderServicePage(service, { production }));
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
const sitemapUrls = [canonicalOrigin + '/', ...services.map(service => `${canonicalOrigin}/${service.slug}/`), canonicalOrigin + privacyPath];
await writeFile(root + 'dist/sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + sitemapUrls.map(url => `<url><loc>${url}</loc></url>`).join('') + '</urlset>\n');
console.log(`Built ${production ? 'production (live only on www.speedysweeties.ca)' : 'preview (no orders or analytics)'} into website/dist.`);
