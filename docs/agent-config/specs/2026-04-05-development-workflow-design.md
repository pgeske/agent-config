# Development Workflow Skill Design

## Goal

Create a new shared skill named `development-workflow` that acts as the default orchestrator for non-trivial implementation work.

The skill should make the development process explicit and repeatable without turning every simple request into a heavyweight ceremony. It should replace the parts of Superpowers the user wants to keep while avoiding repeated planning loops and unnecessary overhead.

## Why A New Skill

- The user wants workflow behavior to be explicit and inspectable.
- The user does not want a large amount of implicit workflow logic embedded in `AGENTS.md`.
- The user wants one clear top-level development entry point.
- The user plans to remove Superpowers, so the workflow must be owned locally in `agent-config` rather than depending on external Superpowers skills.

## Scope

The new skill is for general software implementation work, including:

- non-trivial features
- non-trivial bug fixes
- behavior changes
- multi-file changes
- work that should probably have tests

It is not the primary workflow for:

- docs-only changes
- comments-only changes
- formatting-only changes
- rename-only or other mechanical edits
- deployment-specific flows already handled by `sdlc`

## Skill Shape

`development-workflow` will be a top-level orchestrator skill.

It should not be a giant standalone monolith. Instead, it should compose locally owned workflow pieces from `~/projects/agent-config/skills/` and encode the decision rules between them.

The intended relationship is:

1. `development-workflow` decides whether the request is in scope.
2. `development-workflow` runs the clarification and workflow-selection steps.
3. `development-workflow` invokes or applies the appropriate lower-level local workflow skills and checks.

This keeps one explicit entry point for the user while avoiding duplicated logic.

## Owned Skill Stack

The workflow should be fully owned inside `~/projects/agent-config/skills/`.

The intended stack is:

- `development-workflow` as the orchestrator
- `requirements-clarity` for upfront clarification
- `git-worktree` for isolated workspace setup
- `tdd-red-green-refactor` for explicit TDD discipline
- `final-code-review` for the closing quality gate

These helper skills should be small and single-purpose.

## No Superpowers Dependency

The final workflow must not depend on Superpowers being installed.

That means:

- no references to Superpowers skill names in the final design
- no reliance on Superpowers-owned prompt files or behavior
- no requirement that Superpowers remain installed for the workflow to function

Superpowers can be used as inspiration while designing the new skills, but not as a runtime dependency.

## Trigger Rules

The skill should be written to trigger for implementation requests that are not trivial.

### Trigger

Trigger when the user asks for work that:

- adds or changes behavior
- fixes a real bug
- spans multiple files or subsystems
- should reasonably be validated with tests
- requires coordinated implementation decisions

### Do Not Trigger

Do not trigger for work that is clearly mechanical and low-risk, such as:

- formatting
- comments
- docs
- copy changes
- straightforward renames
- one-line mechanical edits with no meaningful behavioral change

## Workflow Phases

### 1. Requirements Clarification

When the request is underspecified, the skill should ask clarifying questions before implementation.

Requirements for this phase:

- Ask focused questions, one at a time when needed.
- Prefer multiple-choice options when that makes the decision easier.
- Always present a recommended option first.
- Skip this phase when the request is already sufficiently clear.
- Avoid turning obvious, simple work into an interview.

This phase is intentionally lighter than a full spec-heavy workflow. The goal is alignment, not bureaucracy.

### 2. Isolated Workspace Selection

Before non-trivial implementation work, the skill should prefer an isolated git worktree.

Default policy:

- Prefer project-local `.worktrees/` when it already exists or can be safely used.
- If project-local is not appropriate, fall back to a global managed location.
- Verify safety before creating a project-local worktree.
- Skip worktree creation for truly small in-place edits.

This phase should align with the locally owned `git-worktree` helper skill.

### 3. Task Breakdown

Before implementation, the skill should break the work into tasks.

Requirements for this phase:

- Produce a short, actionable task list.
- Keep task granularity practical rather than ceremonial.
- Separate independent tasks from tightly coupled work.
- Use task breakdown for both feature work and meaningful bug fixes.

The output of this phase becomes the basis for execution.

Initial design choice:

- task breakdown logic stays in `development-workflow`
- subagent coordination stays in `development-workflow`
- this should only become a separate helper skill later if reuse pressure appears

### 4. Execution Strategy

The skill should choose between two execution modes.

#### Subagent Mode

Use subagent-driven development when tasks are sufficiently independent and benefit from isolated execution and review.

#### Single-Session Mode

Stay in one session when the work is tightly coupled, small enough that subagents add overhead, or better handled by one continuous implementation flow.

The orchestrator should make this choice explicitly rather than always forcing subagents.

### 5. Test-Driven Implementation

For features, bug fixes, and behavior changes, the skill should require explicit red-green-refactor TDD.

Requirements for this phase:

- Red: write or update a failing test first.
- Verify the test fails for the expected reason.
- Green: make the smallest implementation change needed to pass.
- Refactor: clean up while keeping tests green.

Exceptions are allowed for:

- trivial mechanical edits
- pure documentation or comments
- work where tests are not meaningful or practical

The orchestrator should treat TDD as the default for real implementation work, not as an optional afterthought.

This phase should align with the locally owned `tdd-red-green-refactor` helper skill.

### 6. Final Review Gate

Before the work is considered complete, the skill should run a final quality review.

The review should check for:

- correctness
- simplicity
- unnecessary complexity
- comment quality and quantity
- security risks
- regression risk
- cleanliness and maintainability

Gate behavior:

- Critical findings block completion.
- Important findings block completion.
- Minor nits are reported but do not block completion.

This phase should align with the locally owned `final-code-review` helper skill.

## Relationship To Existing Skills

The orchestrator should reuse locally owned building blocks where they already fit.

Expected reuse:

- worktree setup behavior from `git-worktree`
- red-green-refactor discipline from `tdd-red-green-refactor`
- upfront clarification behavior from `requirements-clarity`
- final review behavior from `final-code-review`

The new skill should define the order, applicability, and escape rules for these phases.

Task breakdown and subagent usage are intentionally left inside `development-workflow` for the first version.

## Relationship To `sdlc`

`sdlc` should remain a specialized workflow for Alyosha's service-building and deployment path.

`development-workflow` should be the general coding workflow for non-trivial implementation work.

If a request is primarily about service creation, packaging, deployment, cluster changes, or PR shipping in the existing Alygo/Alycluster path, `sdlc` remains the better fit.

## Relationship To `AGENTS.md`

The workflow should live primarily in the skill, not in `AGENTS.md`.

If any shared instruction is added to `AGENTS.md`, it should be minimal and only sufficient to point the agent toward the skill for qualifying work. The behavioral detail should remain inside the skill itself.

## Failure And Escape Rules

The orchestrator must not be dogmatic about overhead.

It should explicitly allow skipping or simplifying phases when:

- the task is trivial
- the request is already clear
- a worktree would be needless overhead
- subagents would slow down tightly coupled work
- tests are not meaningful for the requested change

At the same time, it should be strict about using the full workflow when:

- behavior is changing
- a real bug is being fixed
- multiple files or moving parts are involved
- regression risk is real

## Implementation Plan Preview

After this design is approved, implementation should include:

1. Create `~/projects/agent-config/skills/development-workflow/SKILL.md`.
2. Create the helper skills `requirements-clarity`, `git-worktree`, `tdd-red-green-refactor`, and `final-code-review` in `~/projects/agent-config/skills/`.
3. Encode the orchestration rules and phase ordering in `development-workflow`.
4. Keep helper skills small and single-purpose.
5. Keep task breakdown and subagent coordination inside `development-workflow` for v1.
6. Run `~/projects/agent-config/install.sh development-workflow requirements-clarity git-worktree tdd-red-green-refactor final-code-review`.
7. Verify the skills are installed in managed targets.
8. Optionally add a minimal `AGENTS.md` pointer only if needed for auto-invocation.

## Open Design Decisions Resolved

- The workflow will be a new orchestrator skill rather than an expansion of `sdlc`.
- The workflow will be fully owned in `agent-config` and will not depend on Superpowers at runtime.
- It will trigger for non-trivial implementation work based on behavioral change, bug-fix scope, or testing relevance.
- It will prefer project-local `.worktrees/` and fall back to a global managed location when needed.
- It will block completion on critical and important review findings, but not on minor nits.
- Task breakdown and subagent coordination will stay in the orchestrator for the first version.

## Success Criteria

This design succeeds if:

- the user has one clear skill for non-trivial coding work
- the skill asks clarifying questions when needed without becoming heavy-handed
- the skill prefers isolated workspaces for meaningful implementation work
- the skill uses explicit red-green-refactor TDD for real behavior changes
- the skill can use subagents when useful without forcing them every time
- the skill performs a final quality gate before completion
- the overall workflow is meaningfully lighter and clearer than the previous Superpowers setup
- the workflow continues to function after Superpowers is removed
