const { createHash } = require('node:crypto');
const { readdirSync, readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

// The API and UI must build from the same dispatcher sources. Backend-only
// changes do not interrupt dispatchers. Never hash secrets, timestamps or dist.
function dispatcherRelease(root = path.resolve(__dirname, '../speedy-dispatcher')) {
  const hash = createHash('sha256');
  function add(relative) {
    hash.update(relative + '\0');
    hash.update(readFileSync(path.join(root, relative)));
    hash.update('\0');
  }
  function walk(relative) {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(name);
      else if (!/\.test\.|\.map$/.test(name)) add(name);
    }
  }
  walk('src'); walk('public');
  for (const file of ['index.html', 'package.json', 'package-lock.json', 'server.mjs', 'vite.config.ts', 'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.json', 'postcss.config.js', 'tailwind.config.js']) add(file);
  return hash.digest('hex');
}
module.exports = { dispatcherRelease };
if (require.main === module) {
  const destination = path.resolve(__dirname, '../src/generated');
  mkdirSync(destination, { recursive: true });
  writeFileSync(path.join(destination, 'dispatcherRelease.ts'), `// Generated at build time.\nexport const DISPATCHER_RELEASE = ${JSON.stringify(dispatcherRelease())};\n`);
}
