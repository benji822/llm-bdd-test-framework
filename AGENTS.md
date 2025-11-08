# AGENTS.md — Beads-Backed Agent Workflow

This file defines how agents and humans collaborate in this repo using Beads (the `bd` CLI).

BEFORE ANYTHING ELSE: run `bd onboard` and follow the prompt.

Notes
- Scope: entire repository.
- Complementary docs: see `AMP_NATIVE_GUIDE.md` and files under `docs/development/`.
- Do not commit without explicit request. Use `bd` to record work; a human (or CI gate) approves commits/merges.

## Mindset
- Senior-architect rigor. Minimalism first. Verify assumptions.
- Architecture first; reuse over rewrite.
- Use ChunkHound for research before any change.

## Required Tools
- `bd` (Beads CLI).
- ChunkHound: `mcp__chunkhound__search_semantic`, `mcp__chunkhound__search_regex`.
- Existing project toolboxes via `$AMP_TOOLBOX` if applicable.

### Install `bd`
- npm: `npm i -g @beads/bd`
- curl (self-contained): `curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/install.sh | bash`
- Homebrew (macOS/Linux): `brew install beads` (if available on your Homebrew index)

Then run: `bd onboard`.

## First-Time Project Setup
1) Initialize Beads metadata
   - New project: `bd init --team`
   - Individual contributor: `bd init --contributor`
   - Protected `main`? Use a side branch: `git switch -c beads-metadata`; open PR for `.beads/**` updates.

2) Link repo and capture context
   - `bd repo add .`
   - `bd settings set project.name "LLM BDD Test Framework"`

3) Verify install
   - `bd status`
   - `bd ready`

## Daily Agent Workflow
- Research first (ChunkHound):
  - Semantic: `mcp__chunkhound__search_semantic` (describe what you need)
  - Regex: `mcp__chunkhound__search_regex` (pinpoint code/identifiers)

- Plan with Beads:
  - Create work: `bd add --title "<clear goal>" --type task --area testing --priority P2`
  - Add acceptance: `bd note add <id> "Given/When/Then ..."`
  - Dependencies: `bd dep add <id> <blocks-id>`
  - Provenance: `bd discovered-from <id> <source-id-or-url>`

- Execute:
  - Get queue: `bd ready` (pulls next ready items)
  - Start work: `bd start <id>`
  - Update status/notes: `bd update <id> --status in_progress` ; `bd note add <id> "finding X"`
  - Land the plane: `bd close <id> --resolution done`

- Always record learnings:
  - `bd note add <id> "What changed, why, links"`
  - If you create new scripts/fixtures, link them: `bd file add <id> path/to/file`

## Integration With Existing Guidelines
- Deterministic CI: LLM calls never run in CI. Beads is metadata-only; it stores JSONL under `.beads/` tracked by git. Human approves merges.
- Planning & Reviews:
  - Architecture: use Oracle for reviews; attach results to the active bead via `bd note add <id> "Oracle: ..."`.
  - Librarian/Research results: link sources using `bd discovered-from`.

## Coding Standards (enforced by this file)
- KISS, SOLID, DRY. Prefer deletion over complexity.
- No silent errors. Validate and fail loudly.
- No credentials or secrets in repo or beads notes.
- Do not commit without explicit request. Stage changes if needed, but halt before committing.
- After major changes, run tests (`yarn test`) and `bd close` the corresponding item.

## Operational Rules
- Time-box operations that could hang. Prefer `sleep` over polling for waits.
- Use `uuidgen` for unique IDs; ISO-8601 via `date +"%Y-%m-%dT%H:%M:%S%z" | sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/'`.
- Keep directories flat and grep-friendly.

## Beads Tips
- Conflict handling: keep `.beads/**` under version control. If merge conflicts occur, run `bd merge --resolve` (or follow `git` prompts) and then `bd verify`.
- Discoveries vs. Tasks: Capture insights as a bead even if you don’t act immediately; later convert/link it.
- Ready criteria: Only mark tasks ready when inputs, env, and acceptance are explicit.

## Quick Commands
- Initialize: `bd init --team && bd repo add . && bd status`
- Queue: `bd ready`
- New task: `bd add --title "..." --type task`
- Start/Close: `bd start <id>` / `bd close <id> --resolution done`
- Notes/Files: `bd note add <id> "..."` ; `bd file add <id> path`

---

Maintainers: keep this file current. When patterns change, update here and add a bead capturing the rationale.
