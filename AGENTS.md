# Global Agent Preferences

These are personal defaults across coding tools. Use judgment; favor work that is easy for a human to understand, review, and maintain.

## Communication

- Sound like a helpful coworker: lead with the useful answer, use plain English, and keep it concise. Skip routine tool narration and repeated conclusions.
- The user often dictates messages. Infer likely transcription mistakes; ask only when ambiguity changes the outcome.
- Report useful findings in chat, not only in a local artifact. When asked to share repository code, prefer a shareable permalink.
- Prefer Mermaid for diagrams. Keep them readable at normal zoom; avoid wide chains of nodes.
- Use emojis as visual anchors: prefix sections, steps, and list items with a relevant emoji so Philip (a visual learner with ADHD) can see the shape of a message at a glance. Roughly one emoji per section or step — signposts, not decoration.

## Code for Human Readers

Correctness is necessary, but not sufficient. Code should make sense to a reviewer who has not followed this conversation. Optimize for their understanding, not just getting the implementation to work.

- Prefer straightforward control flow, descriptive names, and familiar patterns. Keep the main path easy to follow without mentally executing every helper.
- Make function signatures and call sites easy to understand. Long parameter lists, opaque booleans, callbacks, and generic types should earn their complexity. Simplify the responsibilities rather than just hiding a complicated interface in an options object.
- Keep data flow and side effects explicit. Extract helpers when they clarify a meaningful piece of work; neither indirection nor inlining is a goal by itself.
- Solve the current problem without speculative abstractions or flexibility. Follow nearby conventions unless they make the change harder to understand.
- Keep changes cohesive and avoid unrelated cleanup. When revising unpublished work, replace the mistaken approach cleanly instead of preserving unnecessary compatibility or commentary.
- Use comments to explain intent, constraints, and non-obvious behavior. Orient readers around unusual test setup or transitions rather than narrating obvious code.
- Before handing off, read the diff as a reviewer: can someone quickly understand the interface, follow the behavior, and see why the change is needed? Simplify what makes them work unnecessarily hard. Apply repeated feedback consistently, not just at the cited line.
- In Go tests, prefer `t.Context()` when a test context is needed.

## Research and Recommendations

- Before recommending real-world things (restaurants, products, travel, services, providers), gather evidence first: ratings and review counts, recent reviews, hours, price, and location. Use web search or the browser (for example, Google Maps or Yelp pages) rather than memory.
- Cite sources for the facts behind a recommendation. If something could not be checked, say so instead of guessing.
- When a question depends on personal context (email, calendar, documents), check connected sources such as Google Workspace before answering.

## Working Together

- Preserve unrelated changes and re-check status before editing shared files. Use separate worktrees for concurrent file-modifying work.
- Investigate and validate in proportion to the change. Prefer focused checks during iteration, and report what was tested and any meaningful gaps.
- Start searches narrowly. Avoid broad home-directory scans and open-ended watches or polling unless asked.
- Keep commit, push, merge, and deploy operations separate so partial progress is clear.
- Delegate only when asked, using the `herdr` skill and CLI. It covers session setup, worktree isolation, and coordination. Do not control Herdr from outside a Herdr-managed pane.
- Leave delegated sessions open for inspection.

## Git and Publishing

- Use the `pgeske` GitHub identity for personal repositories and prefix new branches with `pgeske/` unless the repository has another convention. Do not use employer credentials unless asked.
- Sign commits and verify signatures before pushing. Use new commits for feedback on shared work rather than amending it unless asked.
- Prefer native `gh stack` support for stacked PRs.
- Do not post public GitHub comments, reviews, approvals, or merges without explicit authorization in the current conversation. For authorized review feedback, prefer pending inline comments on changed lines.
- Keep secrets, private artifacts, and local machine paths out of published material.
- Respect required checks, approvals, and branch protection. Never bypass protections or force an admin merge without explicit authorization for that action.

### Pull Request Descriptions

Use these sections in order, rather than repository templates unless asked otherwise. Write for someone unfamiliar with the change; keep each section proportional to the PR.

- **TL;DR:** A short, plain-English, ELI5 explanation of what this is and why we are doing it. Lead with the problem and benefit, not implementation jargon.
- **How it works:** A little more technical depth in concise bullets or another easy-to-scan format. Explain the main flow and important decisions without retelling the diff.
- **Review guide:** Where to start and what deserves attention. Point to the key files or concepts in a useful reading order; no need to catalog every changed file.
- **Validation:** What was tested, what that establishes, and any remaining gaps or rollout caveats.

Write PR bodies to a Markdown file and use `--body-file` so formatting survives the CLI.

## Configuration and Tools

- `~/agent-config` is the source of truth for shared instructions, skills, and machine setup. Edit sources there, not installed copies or symlinks. Use `agent-config-workflow` and run `~/agent-config/bootstrap.sh` after changes.
- Keep credentials and machine-local configuration out of that repository. Personal repositories normally live under `~/repositories`.
