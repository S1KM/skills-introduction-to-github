# CLAUDE.md

This file provides guidance for AI assistants working with this repository.

## Repository Overview

This is a **GitHub Skills course** — an interactive, automated learning repository that teaches GitHub fundamentals to beginners. It has no application source code. The entire experience is orchestrated through GitHub Actions workflows and Markdown lesson content.

**Purpose:** Guide learners through five progressive GitHub tasks:
1. Create a branch
2. Commit a file
3. Open a pull request
4. Merge a pull request

## Repository Structure

```
skills-introduction-to-github/
├── .github/
│   ├── dependabot.yml              # Monthly updates for GitHub Actions versions
│   ├── steps/                      # Lesson content (Markdown modules)
│   │   ├── -step.txt               # Current learner progress (single digit: 0–4 or X)
│   │   ├── 0-welcome.md            # Placeholder replaced by workflow on repo creation
│   │   ├── 1-create-a-branch.md    # Lesson: branches, repositories, profile READMEs
│   │   ├── 2-commit-a-file.md      # Lesson: commits, creating PROFILE.md
│   │   ├── 3-open-a-pull-request.md # Lesson: pull requests and collaboration
│   │   ├── 4-merge-your-pull-request.md # Lesson: merging, branch cleanup
│   │   └── X-finish.md             # Course completion recap and next steps
│   └── workflows/                  # GitHub Actions — course progression engine
│       ├── 0-welcome.yml           # Triggers on push to main → advances to step 1
│       ├── 1-create-a-branch.yml   # Triggers on branch create → advances to step 2
│       ├── 2-commit-a-file.yml     # Triggers on push to my-first-branch → advances to step 3
│       ├── 3-open-a-pull-request.yml # Triggers on PR open → advances to step 4
│       └── 4-merge-your-pull-request.yml # Triggers on merge to main → advances to finish
├── images/                         # Screenshots used in README.md and lesson files
├── .gitignore                      # Standard multi-language gitignore
├── LICENSE                         # MIT License (GitHub, Inc.)
└── README.md                       # Active lesson content (auto-updated by workflows)
```

## How the Course Works

### Step Progression

Learner progress is tracked in `.github/steps/-step.txt`, which contains a single value (`0`, `1`, `2`, `3`, `4`, or `X`).

Each GitHub Actions workflow:
1. Reads the current step from `-step.txt`
2. Only proceeds if the step matches what it expects
3. Uses `skills/action-update-step@v2` to update `README.md` with the next lesson and advance `-step.txt`

### Workflow Trigger Map

| Workflow | Trigger Event | Required Step | Condition | Advances To |
|----------|--------------|--------------|-----------|------------|
| `0-welcome.yml` | Push to main | `0` | Non-template repo | Step 1 |
| `1-create-a-branch.yml` | Branch create | `1` | Branch named `my-first-branch` | Step 2 |
| `2-commit-a-file.yml` | Push to branch | `2` | Push to `my-first-branch` | Step 3 |
| `3-open-a-pull-request.yml` | PR opened/reopened | `3` | PR from `my-first-branch` | Step 4 |
| `4-merge-your-pull-request.yml` | Push to main | `4` | Non-template repo | Finish (X) |

### Key Workflow Pattern

All workflows share this structure:
```yaml
jobs:
  get_current_step:          # Job 1: Read -step.txt and output current step
    steps:
      - uses: actions/checkout@v3
      - run: echo "current_step=$(cat ./.github/steps/-step.txt)" >> $GITHUB_OUTPUT

  on_<action>:               # Job 2: Execute only if step matches + conditions met
    needs: get_current_step
    if: >-
      ${{ !github.event.repository.is_template
          && needs.get_current_step.outputs.current_step == <N>
          && <event-specific conditions> }}
    steps:
      - uses: actions/checkout@v3
      - uses: skills/action-update-step@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          from_step: <N>
          to_step: <N+1>
```

## Key Conventions

### README.md is Dynamic

`README.md` is the active lesson display. It is **automatically overwritten** by `skills/action-update-step@v2` with the content from `.github/steps/<N>.md` at each step transition. Do not treat it as a static document.

### Template Repository Guard

All workflows include `!github.event.repository.is_template` to prevent workflows from firing on the template repository itself. They only run on learner forks/copies.

### Learner Feature Branch

The learner is always expected to work on a branch named exactly `my-first-branch`. Workflow conditions check for this exact string.

### No Build System

There is no package manager, build tool, test runner, or linter. There are no scripts to run locally. All automation is GitHub Actions-based and cloud-only.

### Permissions

All workflows require `contents: write` to allow `skills/action-update-step@v2` to commit updated step content and the step tracker back to the repository.

## Making Changes

### Updating Lesson Content

Edit the relevant file in `.github/steps/`:
- Content in these files becomes `README.md` when `skills/action-update-step@v2` runs
- Use Markdown; images should be placed in `images/` and referenced with relative paths (e.g., `![alt](/images/filename.png)`)

### Updating Workflow Logic

Modify files in `.github/workflows/`. Ensure:
- Step number conditions stay consistent with `-step.txt` values
- `from_step` and `to_step` in `skills/action-update-step@v2` remain sequential
- The `!github.event.repository.is_template` guard is preserved

### Checking Current Step

```bash
cat .github/steps/-step.txt
```

### Resetting a Learner's Progress

Manually set `-step.txt` to the desired step number and push. The next valid learner action will trigger the appropriate workflow.

## External Dependencies

- **`skills/action-update-step@v2`** — GitHub action maintained by the GitHub Skills team; handles step file updates and README replacement
- **`actions/checkout@v3`** — Standard GitHub action for checking out repository contents
- **Dependabot** — Configured to check for monthly updates to action versions (see `.github/dependabot.yml`)
