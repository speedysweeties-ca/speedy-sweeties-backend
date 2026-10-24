const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");

const knowledgePath = "src/data/dispatcherHelpKnowledge.ts";

function needsHelpReview(path) {
  if (path === knowledgePath || /\.(test|spec)\.[^/]+$/.test(path)) return false;
  // Include new files, styles, configuration and backend behavior: a controller
  // change can invalidate a procedure even when the React screen is unchanged.
  return /^(speedy-dispatcher\/src\/|src\/|prisma\/)/.test(path) ||
    /^(speedy-dispatcher\/)?(package(-lock)?\.json|server\.mjs|index\.html)$/.test(path);
}

function checkHelpChanges(paths, before, after) {
  const workflows = paths.filter(needsHelpReview);
  const updated = paths.includes(knowledgePath) && typeof after === "string" &&
    after.trim().length > 0 && before?.trim() !== after.trim();
  return { workflows, ok: workflows.length === 0 || updated };
}

function main() {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const requestedBase = process.argv[2] || process.env.HELP_BASE_SHA;
  const base = requestedBase && !/^0+$/.test(requestedBase)
    ? requestedBase : git("merge-base", "HEAD", "origin/main").trim();
  // Resolve to a commit first, never interpret a supplied ref as a git option.
  const baseCommit = git("rev-parse", "--verify", "--end-of-options", `${base}^{commit}`).trim();
  const paths = [...new Set([
    ...git("diff", "--no-renames", "--name-only", "-z", baseCommit, "--").split("\0"),
    ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0"),
  ].filter(Boolean))];
  let before;
  const existed = git("ls-tree", "--name-only", baseCommit, "--", knowledgePath).trim();
  if (existed) before = git("show", `${baseCommit}:${knowledgePath}`);
  let after;
  try { after = readFileSync(knowledgePath, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const result = checkHelpChanges(paths, before, after);
  if (!result.ok) {
    console.error(`Dispatcher behavior changed without a How do I…? guide update:\n${result.workflows.map(path => `  ${path}`).join("\n")}\nUpdate affected articles, reviewedAt and evidence in ${knowledgePath}. See AGENTS.md and docs/dispatcher-help.md.`);
    process.exitCode = 1;
  } else {
    console.log(`Dispatcher help review check passed (${result.workflows.length} implementation files checked).`);
  }
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`Could not verify dispatcher help review: ${error.message}. Fetch full git history and pass a valid base commit.`);
    process.exitCode = 1;
  }
}
module.exports = { needsHelpReview, checkHelpChanges };
