import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('typed ESLint still matches a file allowed into its default project', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'speedy-eslint-'));
  const parser = require('@typescript-eslint/parser');
  t.after(async () => { parser.clearCaches(); await fs.rm(dir, { recursive: true, force: true }); });
  await fs.mkdir(path.join(dir, 'src'));
  await fs.writeFile(path.join(dir, 'src/included.ts'), 'export {};');
  await fs.writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true }, include: ['src/**/*.ts']
  }));
  const filePath = path.join(dir, 'outside.ts');
  const code = 'export const answer: number = 42;';
  await fs.writeFile(filePath, code);
  const result = parser.parseForESLint(code, {
    filePath, tsconfigRootDir: dir, projectService: { allowDefaultProject: ['*.ts'] },
    loc: true, range: true, tokens: true, comment: true
  });
  const program = result.services.program;
  assert.ok(program, 'The matching allowDefaultProject pattern must create type services');
  const declaration = program.getSourceFile(filePath).statements[0].declarationList.declarations[0];
  const checker = program.getTypeChecker();
  assert.equal(checker.typeToString(checker.getTypeAtLocation(declaration.name)), 'number');
  // The scoped override must leave ESLint's legacy callable dependency intact.
  const fromEslint = createRequire(require.resolve('eslint'));
  assert.equal(typeof fromEslint('minimatch'), 'function');
});
