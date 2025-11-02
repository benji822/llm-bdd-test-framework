---
globs:
  - '.github/**/*.yml'
  - '.github/**/*.yaml'
  - 'tests/scripts/cli-ci-verify.ts'
---

# CI/CD Integration and Validation

## Overview

CI pipelines validate pre-generated artifacts deterministically—no LLM calls in CI. The `ci-verify` command aggregates multiple validation gates.

## When to Invoke Oracle

For CI/CD work, consider using Oracle when:
- Designing CI pipeline architecture
- Debugging complex CI failures
- Reviewing performance bottlenecks
- Planning major CI refactoring

Example: "Use Oracle to review this CI pipeline for efficiency and reliability"

## CI Verification Process

`yarn spec:ci-verify` performs:

1. **Schema validation** for all YAML specs
2. **Gherkin linting** across generated `.feature` files
3. **Vocabulary coverage** checks
4. **Selector reconciliation** against registry
5. **Secret scanning** to prevent credential leaks
6. **Artifact packaging** under `tests/artifacts/ci-bundle/`

## GitHub Actions Example

```yaml
name: BDD Pipeline

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: yarn

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Verify test artifacts
        run: yarn spec:ci-verify

      - name: Run Playwright tests
        run: yarn test
        env:
          E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
          E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
          E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}

      - name: Upload artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

## Exit Codes

| Code | Meaning | Action Required |
|------|---------|-----------------|
| `0` | Success | None |
| `2` | Schema validation failed | Fix YAML structure |
| `3` | Gherkin lint failed | Fix `.feature` files |
| `4` | Step coverage failed | Add missing step implementations |
| `5` | Selector validation failed | Update selector registry |
| `6` | Secret scan failed | Remove secrets from committed files |
| `7` | Verification timeout | Optimize pipeline performance |
| `9` | Unknown error | Investigate logs |

## Validation Gates

### Schema Validation
- Validates YAML specs against Zod schemas
- Ensures required fields and correct types
- Catches structural issues early

### Gherkin Linting
- Enforces consistent formatting
- Validates step syntax and parameters
- Configurable rules in `tests/config/`

### Vocabulary Coverage
- Ensures all steps match approved patterns
- Prevents unsupported step implementations
- Maintains test consistency

### Selector Reconciliation
- Verifies all referenced selectors exist
- Checks accessibility and stability
- Updates registry metadata

### Secret Scanning
- Prevents credential leaks
- Scans all text artifacts
- Configurable patterns

## When to Ask Librarian

"Use Librarian to research CI/CD patterns for testing frameworks"

"Ask Librarian about GitHub Actions best practices for Node.js projects"

## Performance Optimization

### Caching Strategy
- Yarn cache for dependencies
- Playwright browser cache
- LLM response cache for local development

### Parallel Execution
- Matrix builds for multiple Node versions
- Parallel test execution with Playwright
- Concurrent artifact validation

### Artifact Management
- Upload failure artifacts automatically
- Cache intermediate results
- Clean up old artifacts

## Oracle + Librarian Workflow

### Example: Optimizing CI Pipeline

**Step 1: Research (Librarian)**
```
"Use Librarian to research CI optimization patterns for testing frameworks.
Search: GitHub Actions, CircleCI, Jenkins
Focus on: caching strategies, parallel execution"
```

**Step 2: Analyze (Oracle)**
```
"Based on Librarian's findings, use Oracle to analyze our CI bottlenecks:
- Identify slowest stages
- Review caching effectiveness
- Suggest parallelization opportunities"
```

**Step 3: Implement (Main Agent)**
```
"Implement Oracle's CI optimizations.
Update GitHub Actions workflow and pipeline scripts."
```

**Step 4: Validate (Oracle)**
```
"Use Oracle to review the optimized CI pipeline:
- Performance improvements
- Reliability impact
- Maintenance overhead"
```

## Best Practices

- Commit generated artifacts for determinism
- Use matrix builds for comprehensive testing
- Implement proper error handling and retries
- Monitor CI performance metrics
- Keep secrets in environment variables
- Use conditional artifact uploads

## Troubleshooting

### CI Verification Failures
- Run `yarn spec:ci-verify` locally first
- Check exit codes for specific failure types
- Review validation output for details

### Test Execution Issues
- Verify environment variables are set
- Check app availability at `E2E_BASE_URL`
- Review Playwright configuration

### Performance Issues
- Monitor cache hit rates
- Check parallel execution settings
- Profile individual pipeline stages

### Artifact Upload Problems
- Verify artifact paths exist
- Check file permissions
- Review GitHub Actions storage limits

## Security Considerations

- Never commit secrets or credentials
- Use GitHub secrets for sensitive data
- Implement secret scanning in CI
- Regularly rotate API keys
- Audit CI pipeline access

## Monitoring and Metrics

- Track CI execution times
- Monitor failure rates by stage
- Measure cache effectiveness
- Alert on performance regressions
