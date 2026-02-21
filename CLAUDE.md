# CLAUDE.md

This file provides guidance for AI assistants working with this repository.

## Repository Overview

This is a **GitHub Skills** educational course template — an interactive, self-paced tutorial that teaches GitHub fundamentals (branches, commits, pull requests, merges) to beginners. It is a **template repository** designed to be copied by learners, not a traditional software application.

There is no application code, no test suite, and no build system. The repository's core logic lives in GitHub Actions workflows that automate learner progression through a series of steps.

## Repository Structure

```
skills-introduction-to-github/
├── .github/
│   ├── dependabot.yml          # Monthly GitHub Actions dependency updates
│   ├── steps/                  # Step instruction files (Markdown)
│   │   ├── -step.txt           # Current step tracker (contains a single digit: 0-4 or "X")
│   │   ├── 0-welcome.md
│   │   ├── 1-create-a-branch.md
│   │   ├── 2-commit-a-file.md
│   │   ├── 3-open-a-pull-request.md
│   │   ├── 4-merge-your-pull-request.md
│   │   └── X-finish.md
│   └── workflows/              # GitHub Actions CI/CD automation
│       ├── 0-welcome.yml
│       ├── 1-create-a-branch.yml
│       ├── 2-commit-a-file.yml
│       ├── 3-open-a-pull-request.yml
│       └── 4-merge-your-pull-request.yml
├── images/                     # Tutorial screenshots referenced in README/steps
├── .gitignore                  # Standard OS/language artifact ignores
├── LICENSE                     # MIT License (Copyright GitHub, Inc.)
└── README.md                   # Primary course content, updates per step
```

## Development Workflows

### How the Course Progression Works

The course advances through numbered steps (0 → 1 → 2 → 3 → 4 → X). Each step is controlled by:

1. **`.github/steps/-step.txt`** — Contains the current step number as a single value. Workflows read this file to decide if they should run.
2. **GitHub Actions workflows** — Event-driven; each workflow checks the current step and fires only when its expected step is active.
3. **`README.md`** — Updated automatically by `skills/action-update-step@v2` to show the correct step instructions.

| Step | File | Trigger Event | Learner Action |
|------|------|--------------|----------------|
| 0 | `0-welcome.yml` | `push` to main (repo init) | Repository created from template |
| 1 | `1-create-a-branch.yml` | `create` event | Create branch `my-first-branch` |
| 2 | `2-commit-a-file.yml` | `push` to `my-first-branch` | Add `PROFILE.md`, commit to branch |
| 3 | `3-open-a-pull-request.yml` | `pull_request` opened/reopened | Open PR from `my-first-branch` → `main` |
| 4 | `4-merge-your-pull-request.yml` | `push` to `main` | Merge PR |
| X | (finish) | — | Course complete |

### Workflow Pattern

All workflows share an identical structure:

```yaml
on: <event>
permissions:
  contents: write
jobs:
  on_<event>:
    if: >-
      ${{ !github.event.repository.is_template
          && steps.get_step.outputs.current_step == '<N>'
          && <event-condition> }}
    steps:
      - name: Get step
        id: get_step
        run: echo "current_step=$(cat .github/steps/-step.txt)" >> $GITHUB_OUTPUT
      - name: Update step
        uses: skills/action-update-step@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          from_step: <N>
          to_step: <N+1>
```

**Key guard conditions:**
- `!github.event.repository.is_template` — Prevents workflows from running on the template repo itself; only runs in learner copies.
- Step check — Only runs when `.-step.txt` matches the expected step.

### Making Changes to Course Content

- **Step instructions** live in `.github/steps/<N>-<name>.md`. Edit these to change what learners read at each step.
- **README.md** is automatically overwritten by `skills/action-update-step@v2` during step transitions. Manual edits to README.md may be overwritten; prefer editing the step files.
- **Images** in `/images/` are referenced via relative paths from README/step files. Add new images here and reference with `/images/<filename>`.
- **Workflow logic** is in `.github/workflows/`. Use GitHub Actions expression syntax for conditions.

## Key Conventions

### File Naming
- Workflows are zero-indexed and prefixed with their step number: `0-welcome.yml`, `1-create-a-branch.yml`, etc.
- Step instruction files mirror workflow names: `0-welcome.md`, `1-create-a-branch.md`, etc.
- The step tracker file has a leading hyphen: `-step.txt` (this is intentional).

### Markdown Style
- Emoji are used for learner engagement (`:wave:`, `:tada:`, `:sparkles:`).
- HTML comments (`<!-- -->`) are used for author notes not visible to learners.
- Images are embedded with standard Markdown syntax referencing `/images/`.
- Links point to official GitHub documentation at `docs.github.com`.

### YAML Style
- All workflows use `fetch-depth: 0` for full git history access.
- Permissions are minimal: only `contents: read` or `contents: write` as needed.
- Comments in YAML reference the docs or explain non-obvious logic.

### Branch Naming (for learners)
- The expected learner branch is `my-first-branch` — workflows explicitly check for this name.

## Dependency Management

- **Dependabot** checks GitHub Actions dependencies monthly (configured in `.github/dependabot.yml`).
- There are no npm, pip, or other package manager dependencies — this is not an application.
- The only external action dependency is `skills/action-update-step@v2`.

## Important Notes for AI Assistants

- **Do not add application code** — this repo has no app, no build step, and no tests. Avoid adding `package.json`, test files, or source code unless explicitly requested.
- **Do not modify README.md directly** for content changes — it is auto-generated from step files by workflows.
- **Preserve the step-tracker file** (`.github/steps/-step.txt`) — its value controls course state. Do not overwrite it unless intentionally resetting a step.
- **Template guard is critical** — the `!github.event.repository.is_template` condition in every workflow prevents the course from triggering on the template itself. Never remove this condition.
- **Branch `my-first-branch`** is hardcoded in workflow conditions. If renaming is needed, update all workflow files consistently.
- **All workflows must remain event-driven and step-gated** — do not simplify them in ways that remove the step-check guard.
