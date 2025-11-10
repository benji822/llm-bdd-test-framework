# AGENTS.md — Beads-Backed Agent Workflow

This file defines how agents and humans collaborate in this repo using Beads via the MCP server (`mcp__beads__*` functions). Fall back to the `bd` CLI only if MCP access is unavailable.

Notes
- Scope: entire repository.
- Complementary docs: see `AMP_NATIVE_GUIDE.md` and files under `docs/development/`.
- Do not commit without explicit request. Use `bd` to record work; a human (or CI gate) approves commits/merges.

## Mindset
- Senior-architect rigor. Minimalism first. Verify assumptions.
- Architecture first; reuse over rewrite.
- Use ChunkHound for research before any change.

## Required Tools
- Beads MCP server: call `mcp__beads__*` functions for all issue-tracking operations (run the `bd` CLI only when MCP is unreachable).
- ChunkHound: `mcp__chunkhound__search_semantic`, `mcp__chunkhound__search_regex`.
- Existing project toolboxes via `$AMP_TOOLBOX` if applicable.

## Issue Tracking with bd (beads)

IMPORTANT: This project uses bd (beads) for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

Use the corresponding `mcp__beads__*` function for each command below (e.g., `mcp__beads__ready`, `mcp__beads__create`, `mcp__beads__update`); run the CLI form only as a fallback.

Check for ready work:
`bd ready --json`

Create new issues:
`bd create "Issue title" -t bug|feature|task -p 0-4 --json`
`bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json`

Claim and update:
`bd update bd-42 --status in_progress --json`
`bd update bd-42 --priority 1 --json`

Complete work:
`bd close bd-42 --reason "Completed" --json`

### Issue Types

- bug — Something broken
- feature — New functionality
- task — Work item (tests, docs, refactoring)
- epic — Large feature with subtasks
- chore — Maintenance (dependencies, tooling)

### Priorities

- 0 — Critical (security, data loss, broken builds)
- 1 — High (major features, important bugs)
- 2 — Medium (default, nice-to-have)
- 3 — Low (polish, optimization)
- 4 — Backlog (future ideas)

### Workflow for AI Agents

Default to MCP calls (`mcp__beads__ready`, `mcp__beads__update`, etc.); treat CLI commands as emergency fallback tooling.

1. Check ready work: `bd ready` shows unblocked issues
2. Claim your task: `bd update <id> --status in_progress`
3. Work on it: Implement, test, document
4. Discover new work? Create linked issue: `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. Complete: `bd close <id> --reason "Done"`
6. Commit together: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### Auto-Sync

bd automatically syncs with git:
- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:
`pip install beads-mcp`

Add to MCP config (e.g., `~/.config/claude/config.json`):
`{"beads": {"command": "beads-mcp", "args": []}}`

Then use `mcp__beads__*` functions instead of CLI commands.

### Managing AI-Generated Planning Documents

AI assistants often create planning and design documents during development:
- PLAN.md, IMPLEMENTATION.md, ARCHITECTURE.md
- DESIGN.md, CODEBASE_SUMMARY.md, INTEGRATION_PLAN.md
- TESTING_GUIDE.md, TECHNICAL_DESIGN.md, and similar files

Best Practice: Use a dedicated directory for these ephemeral files

Recommended approach:
- Create a `history/` directory in the project root
- Store ALL AI-generated planning/design docs in `history/`
- Keep the repository root clean and focused on permanent project files
- Only access `history/` when explicitly asked to review past planning

Optional .gitignore entry:
`history/`

Benefits:
- Clean repository root
- Clear separation between ephemeral and permanent documentation
- Easy to exclude from version control if desired
- Preserves planning history for archeological research
- Reduces noise when browsing the project

### Important Rules

- Use bd for ALL task tracking
- Always use `--json` flag for programmatic use
- Link discovered work with `discovered-from` dependencies
- Check `bd ready` before asking "what should I work on?"
- Store AI planning docs in `history/` directory
- Do NOT create markdown TODO lists
- Do NOT use external issue trackers
- Do NOT duplicate tracking systems
- Do NOT clutter repo root with planning documents

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

Execute every step through the MCP functions when available; mirror commands exist in the CLI if MCP is down.
- Research first (ChunkHound):
  - Semantic: `mcp__chunkhound__search_semantic` (describe what you need)
  - Regex: `mcp__chunkhound__search_regex` (pinpoint code/identifiers)

- Plan with Beads (use `mcp__beads__create`, `mcp__beads__dep_add`, etc.; CLI fallback shown below):
  - Create work: `bd add --title "<clear goal>" --type task --area testing --priority P2`
  - Add acceptance: `bd note add <id> "Given/When/Then ..."`
  - Dependencies: `bd dep add <id> <blocks-id>`
  - Provenance: `bd discovered-from <id> <source-id-or-url>`

- Execute (e.g., `mcp__beads__ready`, `mcp__beads__start`, `mcp__beads__update`; CLI fallback below):
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

---

Maintainers: keep this file current. When patterns change, update here and add a bead capturing the rationale.
