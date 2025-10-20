# LLM-Powered BDD Test Framework

An automated testing framework that transforms plain-text QA specifications into executable Playwright BDD test suites using Large Language Models (LLMs).

## Features

- 🤖 **LLM-Assisted Authoring**: Uses OpenAI Codex or Anthropic Claude to generate test artifacts
- ✅ **Deterministic Execution**: LLM only used during authoring; CI runs are fully deterministic
- 🚀 **Performance Optimized**: 
  - Differential updates with smart caching (100x faster for unchanged specs)
  - Parallel batch processing (3-4x faster for multiple specs)
  - Optimized LLM parameters for speed and consistency
- 📝 **Schema Validation**: Zod-based runtime validation ensures artifact consistency
- 🎯 **Controlled Vocabulary**: Step definitions bound to approved vocabulary
- ♿ **Accessibility-First**: Priority system favoring ARIA roles and labels

## Quick Start

### 1. Installation

```bash
npm install
# or
yarn install
```

### 2. Configuration

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your settings:

```env
# Choose provider
LLM_PROVIDER=codex  # or "claude"
LLM_MODEL=gpt-5-codex

# API Keys
OPENAI_API_KEY=your_key_here
# or
ANTHROPIC_API_KEY=your_key_here

# Test environment
E2E_BASE_URL=http://localhost:4200
E2E_USER_EMAIL=qa.user@example.com
E2E_USER_PASSWORD=SuperSecure123!
```

### 3. Write Your First Spec

Create a plain text specification in `tests/qa-specs/`:

**tests/qa-specs/login.txt**
```
Feature: User login

Users authenticate with email and password.

Happy path:
- User opens the login page.
- User enters valid email and password.
- User clicks submit button.
- User sees welcome message.

Invalid credentials:
- User enters wrong password.
- System shows error message.
```

### 4. Generate Tests

```bash
# Generate clarifications (Q&A for ambiguities)
yarn spec:questions tests/qa-specs/login.txt

# Answer questions in tests/clarifications/login.md

# Generate normalized YAML
yarn spec:normalize tests/qa-specs/login.txt tests/clarifications/login.md

# Generate Gherkin features
yarn spec:features tests/normalized/login.yaml

# Run tests
yarn test
```

## Workflow Commands

### Single Spec Processing

```bash
# Generate clarification questions
yarn spec:questions <spec.txt>

# Normalize to YAML (with caching)
yarn spec:normalize <spec.txt> <clarifications.md> [output.yaml]

# Force regeneration (bypass cache)
yarn spec:normalize <spec.txt> <clarifications.md> --force

# Generate Gherkin features
yarn spec:features <normalized.yaml>
```

### Batch Processing (Recommended)

```bash
# Process all specs in directory
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized

# Custom concurrency
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 4

# Sequential processing (for debugging)
yarn spec:normalize:batch tests/qa-specs tests/clarifications tests/normalized --concurrency 1
```

### Validation & CI

```bash
# Collect selectors from running app
yarn spec:collect-selectors

# Validate coverage and selectors
yarn spec:validate

# Fix TODO selectors automatically
yarn spec:validate-and-fix

# CI verification (all checks)
yarn spec:ci-verify
```

## Pipeline Stages

```
Plain Text Spec → Clarifications → Normalized YAML → Gherkin Features → Executable Tests
     (QA)            (LLM)            (LLM+Schema)        (LLM+Vocab)      (Playwright)
```

### Performance Benefits

| Scenario | Before | After | Improvement |
|----------|--------|-------|-------------|
| Single spec (cached) | 100s | <1s | **100x faster** |
| 10 specs (parallel, cached) | 1000s | 10s | **100x faster** |
| 10 specs (parallel, fresh) | 1000s | 200s | **5x faster** |

## Directory Structure

```
.
├── tests/
│   ├── qa-specs/           # Plain text specifications
│   ├── clarifications/     # LLM-generated Q&A (answered by QA)
│   ├── normalized/         # Validated YAML specs
│   ├── features/           # Generated Gherkin features
│   ├── steps/              # Playwright BDD step implementations
│   ├── scripts/            # Pipeline automation scripts
│   │   ├── llm/           # LLM provider integrations
│   │   ├── types/         # TypeScript type definitions
│   │   └── utils/         # Utilities (caching, hashing, etc.)
│   ├── prompts/           # LLM prompts
│   ├── contracts/         # JSON schemas
│   └── config/            # Framework configuration
├── playwright.config.ts
├── .env.local             # Your configuration
└── package.json
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_PROVIDER` | Yes | - | `codex` or `claude` |
| `LLM_MODEL` | Yes | - | Model identifier |
| `OPENAI_API_KEY` | If codex | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | If claude | - | Anthropic API key |
| `E2E_BASE_URL` | Yes | - | Application URL |
| `LLM_TEMPERATURE` | No | 0.1 | LLM temperature (0-1) |
| `LLM_MAX_TOKENS` | No | 3000 | Max tokens per request |
| `LLM_TIMEOUT_MS` | No | 120000 | Request timeout (ms) |

## Writing Tests

### 1. Create Plain Text Spec

Keep specs focused and small. Each file should test one feature area.

**Good Example:**
```
Feature: Password reset

Users can reset their password via email.

Request reset:
- User clicks "Forgot password" link.
- User enters email address.
- System sends reset email.
- User sees confirmation message.
```

### 2. Answer Clarifications

The LLM will generate questions about ambiguities:

```markdown
## Question 1
**Q**: What is the exact confirmation message text?
**Why it matters**: Test needs precise assertion.
**A**: "Password reset email sent. Check your inbox."
**Required**: Yes
```

### 3. Review Generated YAML

Verify selectors and test data:

```yaml
scenarios:
  - name: Request Password Reset
    selectors:
      forgot-link: 'TODO: add selector'
      email-input: '[data-testid="reset-email"]'
    testData:
      email: '<E2E_USER_EMAIL>'
```

### 4. Implement Step Definitions

Add steps to `tests/steps/*.steps.ts` using your vocabulary.

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: yarn install
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Verify test artifacts
        run: yarn spec:ci-verify
      
      - name: Run tests
        run: yarn test
        env:
          E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
          E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
          E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
      
      - name: Upload artifacts
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## Best Practices

1. **Keep Specs Small**: One feature area per file (< 1KB)
2. **Use Batch Processing**: Process multiple specs together for speed
3. **Commit Artifacts**: Commit YAML and features to Git for deterministic CI
4. **Answer All Required Questions**: Required clarifications must be answered
5. **Use TODO Selectors**: Start with TODOs, fix with `spec:validate-and-fix`
6. **Test Locally First**: Run full pipeline before pushing

## Troubleshooting

### "LLM request timeout"
- Increase `LLM_TIMEOUT_MS` in `.env.local`
- Check API rate limits

### "Validation failed: missing required field"
- Review YAML schema in `tests/contracts/`
- Ensure all required clarifications are answered

### "Step not found in vocabulary"
- Add step definition to `tests/steps/*.steps.ts`
- Update vocabulary configuration

### Cache Issues
- Use `--force` flag to bypass cache: `yarn spec:normalize <spec> <clarifications> --force`
- Delete `tests/artifacts/cache/llm-cache.json`

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new features
4. Submit pull request

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
