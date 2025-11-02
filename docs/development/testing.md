---
globs:
  - 'tests/**/*.ts'
  - 'tests/**/*.js'
  - '**/*.feature'
  - 'tests/qa-specs/**/*.txt'
---

# BDD Testing and LLM Integration Guidelines

## Overview

This project transforms plain-text QA specifications into executable Playwright BDD test suites using Large Language Models (LLMs). Authoring flows stay fast and expressive, while CI is fully deterministic—no LLM calls run in CI pipelines.

## When to Invoke Oracle

For testing work, consider using Oracle when:
- Designing new test architectures or patterns
- Debugging complex test failures with LLM integration
- Reviewing test coverage and quality
- Planning major refactoring of the testing pipeline

Example: "Use Oracle to review this BDD test architecture for scalability and maintainability"

## Pipeline Stages

### 1. Spec Authoring (Plain Text)
- Keep specs small—one feature area per file (< 1 KB)
- Use descriptive, natural language
- Focus on user behavior, not implementation details

### 2. LLM Processing (Authoring Only)
- Uses Codex/Claude for intelligent test generation
- Generates clarification questions for missing details
- Normalizes specs into structured YAML with caching

### 3. Schema Validation
- Zod-backed schemas enforce structure
- Validates selectors, test data, and vocabulary coverage
- Catches issues early in the pipeline

### 4. Gherkin Generation
- Produces executable `.feature` files
- Enforces controlled vocabulary
- Guarantees step implementations exist

### 5. Playwright Execution
- Fully deterministic in CI
- Uses selector registry for stable locators
- Environment-variable resolved test data

## LLM Integration Patterns

### Provider Abstraction
```typescript
interface LLMCompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

abstract class LLMProvider {
  abstract generateCompletion(prompt: string, options: LLMCompletionOptions): Promise<LLMCompletionResult>;
}
```

### Error Handling & Retries
- Timeout enforced at 120s by default
- Exponential backoff for transient failures
- Non-retriable codes bubble up immediately

### Response Caching
- SHA-256 hash of clarifications content
- Cache hit rate 60-80% for iterative refinement
- Bypass with `--force` flag when needed

## When to Ask Librarian

"Use Librarian to research BDD testing patterns in popular frameworks"

"Ask Librarian about Playwright best practices for test isolation"

## Best Practices

- Commit generated artifacts for deterministic CI
- Use batch processing for multiple specs
- Validate selectors against running app before generation
- Run full pipeline locally before pushing

## Common Issues

### LLM Request Timeout
- Increase `LLM_TIMEOUT_MS` in environment
- Check API quotas and connectivity
- Switch providers if needed

### Missing Clarifications
- Answer all **Required: Yes** questions
- Review schema requirements
- Ensure natural language is unambiguous

### Selector Validation Failures
- Run app at `E2E_BASE_URL`
- Recollect selectors: `yarn spec:collect-selectors`
- Add `data-testid` or ARIA attributes if needed

## Oracle + Librarian Workflow

### Example: Adding New Test Pattern

**Step 1: Research (Librarian)**
```
"Use Librarian to research how other BDD frameworks handle async operations.
Search: cucumber-js, playwright-bdd repos
Focus on: promise handling, timeout patterns"
```

**Step 2: Design (Oracle)**
```
"Based on Librarian's findings, use Oracle to design our async test pattern:
- Adapt patterns to our LLM pipeline
- Consider caching implications
- Design error handling strategy"
```

**Step 3: Implement (Main Agent)**
```
"Implement the async pattern based on Oracle's design.
Reference Librarian's findings for specific implementations."
```

**Step 4: Review (Oracle)**
```
"Use Oracle to review the async test implementation:
- Code quality and maintainability
- Performance implications
- Edge cases and error handling"
```
