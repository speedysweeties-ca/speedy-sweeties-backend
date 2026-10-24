# Dispatcher help is part of every workflow change

When adding, removing or changing any dispatcher screen, control, permission,
validation rule or underlying workflow, update the affected articles in
`src/data/dispatcherHelpKnowledge.ts` in the same change. Read the implementation;
use the exact visible labels, the correct roles and the actual side effects.
Set each reviewed article's `reviewedAt` date and keep `evidence` paths current.
Add new pages to both help destination definitions. Remove obsolete instructions
only when the corresponding functionality is actually removed.

For an internal change that preserves staff-visible behavior, re-review the
affected article, update its review date (and evidence if needed), and explain
the unchanged behavior in the PR. Do not rewrite correct instructions merely to
satisfy a check. If reviewed again on the same date, add a specific dated review
comment in the knowledge file describing the affected workflow and conclusion.

The assistant must not learn policy from staff chat or invent live records.
Current published Dispatcher Standards are read in their own screen; the help
guide explains that screen without claiming to know the saved policy wording.

Run `npm run check:dispatcher-help -- <base-ref>` and the checks in
`docs/release-checklist.md`. The CI help check fails when dispatcher/runtime
changes have no accompanying knowledge update. Tests also require every
dispatcher navigation destination to have a guide and a working help link.
Include example questions and affected guide IDs in the PR review notes.

Follow `docs/release-checklist.md` for merge and deployment. Help changes need a
backend release; new source-navigation destinations also need a dispatcher
release. Neither is live just because a branch or pull request exists.
