# LLM-Powered BDD Test Framework Development Guidelines

This project transforms plain-text QA specifications into executable Playwright BDD test suites using Large Language Models (LLMs). Authoring flows stay fast and expressive, while CI is fully deterministic—no LLM calls run in CI pipelines.

## Setup

To enable the Amp-native infrastructure:

```bash
# Set toolbox environment variable (add to ~/.bashrc for persistence)
export AMP_TOOLBOX="$HOME/.config/amp/toolbox"

# Make sure toolboxes are executable
chmod +x $AMP_TOOLBOX/*
```

**Note**: Always use `$AMP_TOOLBOX` environment variable instead of hardcoded paths. The toolboxes are located at `~/.config/amp/toolbox/`.

## Quick Reference

- Build: `npm run build` (TypeScript compilation)
- Test: `yarn test` (Playwright BDD execution)
- Dev: `yarn test:ui` (Playwright UI mode)
- Generate Tests: `yarn spec:questions` → `yarn spec:normalize` → `yarn spec:features`
- Validate: `yarn spec:ci-verify` (comprehensive CI checks)

## Architecture

We use a staged pipeline architecture: Plain Text Specs → LLM Processing → Schema Validation → Gherkin Generation → Playwright Execution

**Core Technologies:**
- Node.js/TypeScript with Playwright for test execution
- LLM providers (Codex/Claude) for intelligent test generation
- Zod schemas for runtime validation
- Cucumber/Gherkin for BDD test structure

## Getting Detailed Guidance

For specific patterns, see:
- @docs/development/testing.md - BDD testing and LLM integration
- @docs/development/playwright.md - Playwright and selector strategies
- @docs/development/scripts.md - Pipeline automation and CLI tools
- @docs/development/ci.md - CI/CD integration and validation

## Toolboxes

Project-specific automation tools are available at `$AMP_TOOLBOX`:
- `validate-architecture` - Validates BDD framework architecture and provides actionable feedback
- `oracle-review` - Triggers Oracle reviews of code changes with structured prompts

## Custom Commands

Orchestrating commands for complex workflows:
- `architecture-review` - Comprehensive architecture review using Oracle
- `debug-with-research` - Debug issues using Oracle analysis + Librarian research
- `capture-knowledge` - Document solutions and share team knowledge

## When to Use Oracle

Use Oracle (GPT-5) for:
- Architecture reviews: "Use Oracle to review this test framework design"
- Complex debugging: "Ask Oracle to help debug this LLM integration issue"
- Planning: "Work with Oracle to plan this new feature implementation"
- Performance analysis: "Use Oracle to analyze this pipeline bottleneck"

## When to Use Librarian

Use Librarian for:
- Framework docs: "Ask Librarian about Playwright test isolation patterns"
- Cross-repo research: "Use Librarian to find how other teams handle LLM caching"
- Best practices: "Librarian, show me TypeScript testing patterns"
- API research: "Use Librarian to research Zod schema validation patterns"

## Mindset
You are a senior architect with 20 years of experience across all software domains.
- Gather thorough information with tools before solving
- Work in explicit steps - ask clarifying questions when uncertain
- BE CRITICAL - validate assumptions, don't trust code blindly
- MINIMALISM ABOVE ALL - less code is better code

## 🔍 CHUNKHOUND RESEARCH PROTOCOL (MANDATORY)

**BEFORE ANY CODE CHANGES, ALWAYS use ChunkHound tools to research existing implementations:**

- `mcp__chunkhound__search_semantic` for natural language discovery
- `mcp__chunkhound__search_regex` for specific pattern matching
- `tb__chunkhound_search_semantic` and `tb__chunkhound_search_regex` as alternatives

**NEVER make changes without understanding existing code first!**

## Search Protocol
- Use the Code Expert to learn the surrounding code style, architecture and module responsibilities
- Use ChunkHound semantic search for initial exploration
- Use ChunkHound regex search for specific patterns
- Multiple targeted searches > one broad search

## Architecture First
LEARN THE SURROUNDING ARCHITECTURE BEFORE CODING.
- Understand the big picture and how components fit
- Find and reuse existing code - never duplicate
- When finding duplicate responsibilities, refactor to shared core
- Match surrounding patterns and style

## Coding Standards
KISS - Keep It Simple:
- Write minimal code that compiles and lints cleanly
- Fix bugs by deleting code when possible
- Optimize for readability and maintenance
- No over-engineering, no temporary compatibility layers
- No silent errors - failures must be explicit and visible
- Run tests after major changes
- Document inline when necessary

## Operational Rules
- Time-box operations that could hang
- Use `uuidgen` for unique strings
- Use `date +"%Y-%m-%dT%H:%M:%S%z" | sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/'` for ISO-8601
- Use flat directories with grep-friendly naming
- Point out unproductive paths directly

## Critical Constraints
- NEVER Commit without explicit request
- NEVER Leave temporary/backup files (we have version control)
- NEVER Hardcode keys or credentials
- NEVER Assume your code works - ALWAYS Verify
- ALWAYS Clean up after completing tasks
- ALWAYS Produce clean code first time - no temporary backwards compatibility
- ALWAYS Use sleep for waiting, not polling

## 🔍 CHUNKHOUND RESEARCH PROTOCOL (ALWAYS USE FIRST)

**MANDATORY: Use ChunkHound for ALL research tasks before making any code changes.**

Available ChunkHound tools:
- `mcp__chunkhound__search_semantic` — Natural language discovery across files
- `mcp__chunkhound__search_regex` — Exact text/pattern lookups
- `tb__chunkhound_search_semantic` — Alternative semantic search
- `tb__chunkhound_search_regex` — Alternative regex search
- `mcp__chunkhound__get_stats` — Repository statistics
- `mcp__chunkhound__health_check` — System health check

### When to Use ChunkHound
- **BEFORE ANY CODE CHANGES**: Research existing implementations and patterns
- **Debugging**: Find related code and understand data flow
- **Architecture Analysis**: Map component relationships and dependencies
- **Pattern Discovery**: Identify existing solutions and conventions
- **Code Review**: Understand how features are currently implemented

### ChunkHound Usage Guidelines

**Step 1: Semantic Search First**
```
Use mcp__chunkhound__search_semantic with natural language queries:
- "where do we handle LLM provider switching?"
- "how is the selector registry implemented?"
- "what caching patterns are used in the pipeline?"
```

**Step 2: Refine with Regex**
```
Use mcp__chunkhound__search_regex for specific patterns:
- LLM_PROVIDER, data-testid, yarn spec:
- class.*Service, interface.*Provider
- export.*function, const.*=
```

**Step 3: Deep Analysis**
```
For complex architecture questions, use multiple searches:
- Start broad, then narrow down
- Cross-reference findings from multiple searches
- Document patterns and relationships found
```

### Research Protocol
1. **Identify Research Need**: What do you need to understand?
2. **Semantic Search**: Start with natural language queries
3. **Pattern Analysis**: Use regex to find specific implementations
4. **Cross-Reference**: Verify findings across multiple searches
5. **Document Findings**: Note patterns, dependencies, and relationships
6. **Proceed with Changes**: Only after understanding existing code

**NEVER make changes without ChunkHound research first!**