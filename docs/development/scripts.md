---
globs:
  - 'tests/scripts/**/*.ts'
  - 'tests/scripts/cli-*.ts'
---

# Pipeline Automation and CLI Tools

## Overview

The testing pipeline consists of TypeScript modules in `tests/scripts/` with CLI wrappers. Each stage has dedicated validation and error handling.

## Pipeline Architecture

```
Plain Text Spec ──┐
                  │  yarn spec:questions         ┌─────────────────────┐
                  ├─> Clarification Markdown ───►│ generate-questions  │
                  │                              └─────────────────────┘
                  │  yarn spec:normalize         ┌─────────────────────┐
                  ├─> Normalized YAML ──────────►│ normalize-yaml      │
Selector Registry │                              └─────────────────────┘
                  │  yarn spec:validate-and-fix  ┌─────────────────────┐
(Optional Gate)   ├─> Selector Validation ──────►│ validate-and-fix    │
                  │                              └─────────────────────┘
                  │  yarn spec:features          ┌─────────────────────┐
Step Vocabulary   ├─> Gherkin Features ─────────►│ generate-features   │
                  │                              └─────────────────────┘
                  │  yarn spec:ci-verify         ┌─────────────────────┐
                  └─> CI Verification ─────────►│ ci-verify            │
                                                  └─────────────────────┘
```

## When to Invoke Oracle

For pipeline work, consider using Oracle when:
- Designing new pipeline stages or validation logic
- Debugging complex script failures or edge cases
- Reviewing performance bottlenecks in the pipeline
- Planning major refactoring of CLI tools

Example: "Use Oracle to review this pipeline architecture for performance and maintainability"

## CLI Entry Points

| Stage | Module | CLI Command | Responsibility |
|-------|--------|-------------|----------------|
| Questions | `generate-questions.ts` | `yarn spec:questions` | Render prompts, call LLM, persist Q&A markdown |
| Normalization | `normalize-yaml.ts` | `yarn spec:normalize` | Convert spec + clarifications into schema-validated YAML |
| Validation | `validate-and-fix-selectors.ts` | `yarn spec:validate-and-fix` | Validate selectors against live app, emit reports |
| Features | `generate-features.ts` | `yarn spec:features` | Produce `.feature` files with vocabulary coverage |
| Graph compile | `action-graph/compiler.ts` | `yarn spec:compile-graph` | Convert action graphs into `.feature` + deterministic step defs |
| CI Verify | `ci-verify.ts` | `yarn spec:ci-verify` | Aggregate validation checks, bundle artifacts |

## LLM Provider Abstraction

```typescript
interface LLMCompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

abstract class LLMProvider {
  abstract generateCompletion(
    prompt: string,
    options: LLMCompletionOptions
  ): Promise<LLMCompletionResult>;
}
```

## Performance Optimizations

### Differential Caching
- SHA-256 hash of clarifications content
- Cache hit rate: 60-80% for iterative refinement
- Force regeneration: `--force` flag

### Parallel Batch Processing
- Dynamic worker pools: `(CPU cores - 1)`
- Reuses LLM provider instances
- 3-4× faster for 10-spec workloads

### Parameter Tuning
- Temperature: 0.1 for deterministic outputs
- Max tokens: 3000, timeout: 120s
- Override via environment variables

## Error Handling

### Exit Codes
- `0`: Success
- `2`: Schema validation failed
- `3`: Gherkin lint failed
- `4`: Step coverage failed
- `5`: Selector validation failed
- `6`: Secret scan failed
- `7`: Verification timeout
- `9`: Unknown error

### Retry Logic
- Exponential backoff for transient failures
- Non-retriable codes bubble up immediately
- Configurable timeout and retry limits

## When to Ask Librarian

"Use Librarian to research CLI tool patterns in Node.js testing frameworks"

"Ask Librarian about error handling patterns in TypeScript CLI applications"

## Shared Utilities

Located in `tests/scripts/utils/`:
- `file-operations.ts` - File I/O helpers
- `hash.ts` - Content hashing for caching
- `yaml-parser.ts` - YAML processing with validation
- `benchmark-runner.ts` - Performance measurement

## Configuration Management

- Environment variables for LLM settings
- Zod schemas for runtime validation
- JSON schemas for artifact validation
- Tool configurations (gherkinlint, etc.)

## Oracle + Librarian Workflow

### Example: Adding Pipeline Stage

**Step 1: Research (Librarian)**
```
"Use Librarian to research pipeline patterns in similar testing frameworks.
Search: cypress, webdriverio repos
Focus on: stage orchestration, error handling"
```

**Step 2: Design (Oracle)**
```
"Based on Librarian's findings, use Oracle to design our new pipeline stage:
- Integration points with existing stages
- Error handling and validation
- Performance considerations"
```

**Step 3: Implement (Main Agent)**
```
"Implement the new pipeline stage based on Oracle's design.
Add CLI wrapper and integrate with existing pipeline."
```

**Step 4: Test (Oracle)**
```
"Use Oracle to review the pipeline integration:
- Stage sequencing and dependencies
- Error propagation and handling
- Performance impact on overall pipeline"
```

## Best Practices

- Use TypeScript for all pipeline code
- Implement comprehensive error handling
- Add progress reporting for long-running operations
- Validate inputs and outputs at each stage
- Document CLI options and exit codes
- Test pipeline stages independently

## Common Issues

### LLM Provider Errors
- Check API keys and quotas
- Verify network connectivity
- Switch providers if needed

### Schema Validation Failures
- Review Zod schemas in `tests/scripts/types/`
- Check input data format
- Update schemas for new requirements

### File Operation Errors
- Verify file permissions
- Check path separators (cross-platform)
- Handle concurrent file access

### Performance Degradation
- Monitor cache hit rates
- Check parallel processing settings
- Profile LLM request times
