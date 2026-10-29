# NotesApp development instructions

## Repository and scope

GitHub `ChristianMarzianGithub/NotesApp` is the authoritative development repository.
GitLab `cmarzian91-group/notesapp` is its downstream mirror. Preserve
`.github/workflows/sync-gitlab.yml` and its synchronization behavior. Do not push
directly to the GitLab mirror or modify the shared framework repository.

This repository currently contains framework integration only. No application
stack, build, runtime, or test suite has been installed. Do not implement the
application unless a future task requests it, and do not report application tests
as passing. Use the existing isolated checkout; do not create a Git worktree
unless the user explicitly requests one. Use a feature branch and a pull request
for changes; never automatically merge.

## Load the shared framework explicitly

Before development tasks, initialize the pinned dependency if necessary:

```bash
git submodule update --init --recursive
```

Read and follow [ai-framework/AGENTS.md](ai-framework/AGENTS.md) and
[ai-framework/README.md](ai-framework/README.md). If unavailable, resolve submodule
access before proceeding with framework-dependent work. Do not copy its files
into this repository. Framework paths resolve from `ai-framework/`, not NotesApp's
root. Its repository-authority instructions apply to the framework itself;
NotesApp changes belong on GitHub.

Codex must explicitly locate and read the relevant role and skill; skills inside
the submodule are not assumed to be automatically discovered:

| Task | Role | Skill |
| --- | --- | --- |
| Product requirements | `ai-framework/agents/product.md` | `ai-framework/skills/product-discovery/SKILL.md` |
| Consequential design | `ai-framework/agents/architect.md` | `ai-framework/skills/architecture-design/SKILL.md` |
| Implementation or fixes | `ai-framework/agents/engineer.md` | `ai-framework/skills/implementation/SKILL.md` |
| Review | `ai-framework/agents/reviewer.md` | `ai-framework/skills/code-review/SKILL.md` |
| Release readiness | `ai-framework/agents/operations.md` | `ai-framework/skills/release-readiness/SKILL.md` |

Use only relevant stages. Follow each selected skill's workflow and output
contract, and read its instructions before acting. Use roles as working
perspectives, not automatically running subagents. Delegate only when supported
and explicitly permitted. Label review performed by the same assistant as
self-review. Use templates in `ai-framework/templates/` when useful for durable
product briefs, tasks, architecture decisions, and release checklists.

## Project conventions and verification

Keep NotesApp-specific instructions here, durable project documentation under
`docs/`, and any future project-specific skills under `skills/<name>/SKILL.md`.
Explicitly link and read those skills when added. Do not duplicate existing
framework roles or skills. Do not edit files inside `ai-framework/`; dependency
updates must be intentional, reviewed, and committed separately.

Inspect existing content and the working tree before edits. Preserve unrelated
changes and keep credentials out of files and logs. Follow the shared workflow:
define acceptance criteria, inspect and select skills, implement and document,
verify, review as appropriate, and report evidence and limitations.

For this integration, run from the repository root:

```bash
git diff --check
git submodule status --recursive
git ls-files --stage ai-framework
git -C ai-framework status --short
git diff HEAD -- .github/workflows/sync-gitlab.yml
```

Expect a mode `160000` gitlink, a clean submodule at the recorded revision, and
no synchronization-workflow changes. Check documentation links and inspect the
complete diff. When application code is introduced, document its actual stack
and verified setup, build, lint, and test commands here.
