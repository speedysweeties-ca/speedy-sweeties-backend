const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');

const fromGax = createRequire(require.resolve('google-gax'));
const fromRimraf = createRequire(fromGax.resolve('rimraf'));

test('SDK cleanup keeps async/sync glob behavior and deletes only matched temporary files', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'speedy-dependency-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'nested'));
  for (const file of ['keep.proto', '.hidden.proto', 'nested/other.proto', 'remove.tmp', 'keep.txt']) {
    await fs.writeFile(path.join(dir, file), 'synthetic fixture');
  }
  const { glob, globSync } = fromRimraf('glob');
  const options = { cwd: dir, dot: true, nodir: true };
  const expected = ['.hidden.proto', 'keep.proto', 'nested/other.proto'];
  assert.deepEqual((await glob('**/*.proto', options)).sort(), expected);
  assert.deepEqual(globSync('**/*.proto', options).sort(), expected);
  assert.equal(await fromGax('rimraf').rimraf(path.join(dir, '*.tmp'), { glob: true }), true);
  assert.equal(await fs.readFile(path.join(dir, 'keep.txt'), 'utf8'), 'synthetic fixture');
  await assert.rejects(fs.stat(path.join(dir, 'remove.tmp')), { code: 'ENOENT' });
  assert.deepEqual((await glob('**/*.proto', options)).sort(), expected);
});

test('legacy development cleanup keeps its callable CommonJS matcher', () => {
  const fromDevRunner = createRequire(require.resolve('ts-node-dev'));
  const fromLegacyRimraf = createRequire(fromDevRunner.resolve('rimraf'));
  const fromLegacyGlob = createRequire(fromLegacyRimraf.resolve('glob'));
  assert.equal(typeof fromDevRunner('rimraf'), 'function');
  const match = fromLegacyGlob('minimatch');
  assert.equal(typeof match, 'function');
  assert.equal(match('src/order.ts', '**/*.ts'), true);
  assert.equal(match('src/order.js', '**/*.ts'), false);
});

test('Cloud Storage XML dependency preserves multipart receipt structure without a provider call', () => {
  const fromStorage = createRequire(require.resolve('@google-cloud/storage'));
  const { XMLParser, XMLBuilder } = fromStorage('fast-xml-parser');
  const multipart = { CompleteMultipartUpload: { Part: [
    { PartNumber: 1, ETag: '"synthetic-first"' }, { PartNumber: 2, ETag: '"synthetic-second"' }
  ] } };
  const xml = new XMLBuilder().build(multipart);
  assert.deepEqual(new XMLParser().parse(xml), multipart);
  assert.throws(() => new XMLParser({ stopNodes: ['stop'] }).parse('<stop>' + '<a '.repeat(500)));
  assert.equal(typeof require('google-gax').GrpcClient, 'function');
  assert.equal(typeof require('firebase-admin/messaging').getMessaging, 'function');
});
