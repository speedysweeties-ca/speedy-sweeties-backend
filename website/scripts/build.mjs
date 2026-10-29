import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--production');
await rm(root + 'dist', { recursive: true, force: true });
await mkdir(root + 'dist', { recursive: true });
await cp(root + 'src', root + 'dist', { recursive: true });
let html = await readFile(root + 'dist/index.html', 'utf8');
html = html.replace('<!--BUILD_ROBOTS-->', production ? '' : '<meta name="robots" content="noindex, nofollow">');
await writeFile(root + 'dist/index.html', html);
await writeFile(root + 'dist/js/site-config.js', `/* Generated at build time. Preview is the default. */
(() => {
  const production = ${production};
  const live = production && ['www.speedysweeties.ca', 'speedysweeties.ca'].includes(window.location.hostname);
  window.speedySite = Object.freeze({ live });
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
await writeFile(root + 'dist/sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.speedysweeties.ca/</loc></url></urlset>\n');
console.log(`Built ${production ? 'production (live only on the two production domains)' : 'preview (no orders or analytics)'} into website/dist.`);
