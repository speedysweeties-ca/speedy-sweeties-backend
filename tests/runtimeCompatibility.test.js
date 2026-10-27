const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { brotliCompressSync, brotliDecompressSync } = require('node:zlib');
const test = require('node:test');

test('patched built-in Brotli preserves ordinary compression/decompression', () => {
  const input = Buffer.from('Synthetic runtime compatibility fixture. '.repeat(1000));
  assert.deepEqual(brotliDecompressSync(brotliCompressSync(input)), input);
});

for (const mode of ['DRY_RUN', 'SEND']) {
  test(`retention cron remains isolated and DRY_RUN-only: ${mode}`, () => {
    // Replace Prisma BEFORE loading the actual compiled cron entrypoint. This
    // child has no provider/database credentials and cannot touch customer data.
    const program = `
      const assert = require('node:assert/strict');
      let reads = 0, writes = 0, connects = 0, disconnects = 0;
      const prisma = {
        $connect: async () => { connects++; },
        $disconnect: async () => { disconnects++; },
        customer: { findMany: async () => {
          reads++;
          return [{ id: 'runtime-synthetic', phone: '6135550100',
            smsMarketingOptOut: false, smsExpressConsentAt: null,
            smsExpressConsentSource: null,
            orders: [{ deliveredAt: new Date(Date.now() - 100 * 86400000),
              createdAt: new Date(Date.now() - 100 * 86400000) }] }];
        } },
        retentionMessage: { createMany: async ({ data, skipDuplicates }) => {
          writes++;
          assert.equal(skipDuplicates, true);
          assert.equal(data.length, 1);
          assert.equal(data[0].customerId, 'runtime-synthetic');
          assert.equal(data[0].status, 'DRY_RUN');
          return { count: 1 };
        } }
      };
      const prismaPath = ${JSON.stringify(require.resolve('../dist/lib/prisma.js'))};
      require.cache[prismaPath] = { id: prismaPath, filename: prismaPath,
        loaded: true, exports: { prisma } };
      process.once('exit', () => {
        assert.equal(connects, 1); assert.equal(disconnects, 1);
        assert.equal(reads, process.env.RETENTION_SMS_MODE === 'DRY_RUN' ? 1 : 0);
        assert.equal(writes, process.env.RETENTION_SMS_MODE === 'DRY_RUN' ? 1 : 0);
      });
      require(${JSON.stringify(require.resolve('../dist/jobs/retention90.job.js'))});
    `;
    const child = spawnSync(process.execPath, ['-e', program], {
      env: { PATH: process.env.PATH, RETENTION_SMS_MODE: mode },
      encoding: 'utf8', timeout: 5000
    });
    assert.equal(child.status, mode === 'DRY_RUN' ? 0 : 1);
    if (mode === 'DRY_RUN') {
      assert.match(child.stdout, /New dry-run records created: 1/);
      assert.match(child.stdout, /SMS messages sent: 0/);
      assert.equal(child.stderr, '');
    } else {
      assert.equal(child.stdout, '');
      assert.equal(child.stderr.trim(), '90-day retention job failed: Error');
    }
  });
}
