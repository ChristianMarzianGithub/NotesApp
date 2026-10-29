# NotesApp

NotesApp is prepared for future AI-assisted development. No application has been
implemented yet. GitHub is the authoritative development repository;
[GitLab NotesApp](https://gitlab.com/cmarzian91-group/notesapp) is a downstream
mirror maintained by the existing GitHub Actions synchronization workflow.
Make changes through GitHub branches and pull requests, never by pushing to the
GitLab mirror. The synchronization workflow is unchanged by this integration.

## Shared AI Framework

[AI Framework](https://gitlab.com/cmarzian91/AI_Framework) supplies reusable role
instructions, skills, workflows, and templates. It is a separately maintained
dependency registered as a genuine Git submodule at `ai-framework/`, not copied
application source. NotesApp records its exact commit in a Git gitlink; ordinary
submodule initialization restores that revision without following newer commits.
The initial revision is `d78f32cf954250087bccad3afdf4340a0c6e3a52` from `main`.

Git and read access to both repositories are the only prerequisites for this
integration. Framework changes are outside the scope of this repository.

## Clone and initialize

```bash
git clone --recurse-submodules https://github.com/ChristianMarzianGithub/NotesApp.git
cd NotesApp
```

For an existing clone, or after switching to a commit with a different pin:

```bash
git submodule update --init --recursive
```

Inspect the recorded and checked-out revisions:

```bash
git submodule status --recursive
git ls-files --stage ai-framework
git -C ai-framework rev-parse HEAD
git -C ai-framework status --short
```

The index entry must have mode `160000`. A leading space in submodule status
means the checkout matches the recorded revision; `-` means uninitialized and
`+` means a different revision is checked out.

## Intentionally update the framework

Start a separate GitHub feature branch with a clean framework working tree.
The configured update branch is `main`; updates use checkout mode:

```bash
git submodule update --remote ai-framework
git diff --submodule=log -- ai-framework
git -C ai-framework rev-parse HEAD
```

Read the updated instructions and review the framework changes before accepting
them. Updating changes the pinned submodule revision in the working tree; it
must be reviewed and committed separately in NotesApp:

```bash
git add ai-framework
git commit -m "chore: update AI Framework revision"
```

Open a GitHub pull request. Do not push to or edit the framework. To discard an
uncommitted pin update, first ensure the submodule has no local edits, then run
`git submodule update --init --recursive ai-framework` to restore the index pin.
There is no automatic framework-update job.

## Continue development with Codex

[Root AGENTS.md](AGENTS.md) directs Codex to explicitly read the shared
[instructions](ai-framework/AGENTS.md) and [README](ai-framework/README.md), then
select and read the relevant files under `ai-framework/agents/` and
`ai-framework/skills/`. Submodule skills are not assumed to be automatically
discovered. Roles are working perspectives; they do not automatically spawn
agents. Actual delegation requires support and explicit permission.

Use the framework's established workflow and output contracts. Its templates
under `ai-framework/templates/` support durable briefs, tasks, architecture
decisions, and release checklists when appropriate. Keep NotesApp-specific
instructions in root `AGENTS.md`, documentation in `docs/`, and future local
skills in `skills/<name>/SKILL.md`; link new skills explicitly from the project
instructions. These directories need only be created when useful.

Example future prompt: “Read AGENTS.md and the relevant framework role and skill.
Define a scoped NotesApp MVP before implementation.” Application development
requires a separate request. There are currently no application build or test
commands; integration verification commands are recorded in `AGENTS.md`.
