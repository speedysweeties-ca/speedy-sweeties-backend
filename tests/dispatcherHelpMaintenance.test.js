const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");
const ts = require("typescript");
const { dispatcherHelpKnowledge: articles, helpArticlesForRole } = require("../dist/data/dispatcherHelpKnowledge.js");
const { checkHelpChanges } = require("../scripts/checkDispatcherHelp.cjs");
const root = path.resolve(__dirname, "..");
const knowledgePath = "src/data/dispatcherHelpKnowledge.ts";

function source(file) {
  return ts.createSourceFile(file, fs.readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true);
}
function findNode(tree, predicate) {
  if (predicate(tree)) return tree;
  return ts.forEachChild(tree, child => findNode(child, predicate));
}

test("every dispatcher tab has a source guide and a valid client navigation destination", () => {
  const app = source("speedy-dispatcher/src/App.tsx");
  const tabs = findNode(app, n => ts.isTypeAliasDeclaration(n) && n.name.text === "ActiveTab")
    .type.types.map(n => n.literal.text).sort();
  const client = source("speedy-dispatcher/src/dispatcherHelpClient.ts");
  const declaration = findNode(client, n => ts.isVariableDeclaration(n) && n.name.getText(client) === "helpDestinations");
  const destinations = declaration.initializer.expression.properties.map(n => n.name.text).sort();
  assert.deepEqual(destinations, tabs, "Keep help links aligned with real tabs, including newly added tabs");
  assert.deepEqual([...new Set(articles.map(a => a.destination))].sort(), tabs, "Every tab needs a maintained source guide");
});

test("guides have unique source IDs, valid review dates and existing evidence", () => {
  assert.equal(new Set(articles.map(a => a.id)).size, articles.length);
  for (const article of articles) {
    assert.ok(article.title.trim() && article.content.trim(), article.id);
    assert.match(article.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(article.reviewedAt).toISOString().slice(0, 10), article.reviewedAt);
    assert.ok(article.evidence.length > 0, article.id);
    for (const evidence of article.evidence) {
      assert.ok(fs.statSync(path.join(root, evidence.split(":")[0])).isFile(), `${article.id}: ${evidence}`);
    }
  }
});

test("administration guides cannot be supplied as dispatcher sources", () => {
  const privateIds = ["manage-standards", "staff-accounts", "dispatcher-logout", "logout-log", "dispatcher-performance", "bnd-emails"];
  for (const id of privateIds) {
    assert.ok(helpArticlesForRole("ADMIN").some(a => a.id === id));
    assert.ok(!helpArticlesForRole("DISPATCHER").some(a => a.id === id));
  }
  for (const role of ["DRIVER", "", "unknown"]) assert.deepEqual(helpArticlesForRole(role), []);
});

test("workflow changes require an accompanying nonempty knowledge update", () => {
  for (const file of ["speedy-dispatcher/src/NewScreen.tsx", "speedy-dispatcher/src/App.css", "src/controllers/order.controller.ts", "src/services/newWorkflow.ts", "src/routes/newRoute.ts", "prisma/schema.prisma"]) {
    assert.equal(checkHelpChanges([file], "old", "old").ok, false, file);
    assert.equal(checkHelpChanges([file, knowledgePath], "old", "old\n").ok, false);
    assert.equal(checkHelpChanges([file, knowledgePath], "old", undefined).ok, false);
    assert.equal(checkHelpChanges([file, knowledgePath], "old", " ").ok, false);
    assert.equal(checkHelpChanges([file, knowledgePath], "old", "reviewed guide").ok, true);
  }
  assert.equal(checkHelpChanges(["tests/order.test.js", "speedy-dispatcher/src/example.test.ts", "docs/release-checklist.md"], "old", "old").ok, true);
});

test("git review check catches a new screen and a deleted guide, and fails on an invalid base", t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dispatcher-help-check-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const script = path.join(root, "scripts/checkDispatcherHelp.cjs");
  const run = base => spawnSync(process.execPath, [script, base], { cwd: repo, encoding: "utf8" });
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), text); };
  git("init"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "Test");
  write(knowledgePath, "original guide"); git("add", "."); git("commit", "-m", "baseline");
  const base = git("rev-parse", "HEAD");
  assert.equal(run(base).status, 0);
  write("speedy-dispatcher/src/NewScreen.tsx", "new screen");
  assert.equal(run(base).status, 1, "Untracked new UI must also require review locally");
  write(knowledgePath, "reviewed guide");
  assert.equal(run(base).status, 0);
  git("add", "."); git("commit", "-m", "feature and guide");
  assert.equal(run(base).status, 0, "Check the whole PR range, not only its last commit");
  fs.unlinkSync(path.join(repo, knowledgePath));
  assert.equal(run(base).status, 1);
  assert.equal(run("missing-base").status, 1, "Unavailable history must not silently pass");
});
