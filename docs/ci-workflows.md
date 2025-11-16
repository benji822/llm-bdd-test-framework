# CI/CD Workflows

This guide shows how to integrate the LLM BDD framework into your CI/CD pipeline.

## Key Principles

1. **Compile in CI, never record**: Specs are in git, compile them to generate tests.
2. **Environment variables only**: Base URLs, API credentials, and test data come from CI secrets.
3. **Generated code not in git**: `.spec.ts` files are ephemeral, rebuild on every run.
4. **Deterministic execution**: Same spec + same environment = same test behavior.

## GitHub Actions Example

### Basic E2E Test Workflow

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest

    services:
      app:
        image: myapp:latest
        ports:
          - 3000:3000
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          API_KEY: ${{ secrets.API_KEY }}

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

      - name: Compile specs
        run: |
          yarn llm compile specs/*.txt \
            --pages pages.yaml \
            --connectors connectors.yaml \
            --out-dir tests/e2e-gen
        env:
          API_BASE_URL: http://localhost:3001
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Verify selectors
        run: |
          yarn llm verify \
            --base-url http://localhost:3000 \
            --spec-dir tests/e2e-gen
        continue-on-error: true

      - name: Run Playwright tests
        run: yarn test tests/e2e-gen
        env:
          E2E_BASE_URL: http://localhost:3000

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/

      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(
              fs.readFileSync('playwright-report/index.json', 'utf8')
            );
            const passed = report.stats.expected;
            const failed = report.stats.unexpected;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## E2E Test Results\n✅ ${passed} passed\n❌ ${failed} failed`
            });
```

### Setup with Test Data

If your tests need pre-created data (via connectors), add setup steps:

```yaml
name: E2E Tests with Setup

on:
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      api:
        image: myapp-api:latest
        env:
          DATABASE_URL: postgres://postgres:postgres@postgres:5432/test_db
          PORT: 3001
        ports:
          - 3001:3001

      app:
        image: myapp-web:latest
        env:
          API_BASE_URL: http://localhost:3001
          PORT: 3000
        ports:
          - 3000:3000

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: yarn

      - name: Wait for services
        run: |
          npm install -g wait-on
          wait-on http://localhost:3000 -t 30000
          wait-on http://localhost:3001 -t 30000

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Compile specs (with setup execution)
        run: |
          yarn llm compile specs/*.txt \
            --pages pages.yaml \
            --connectors connectors.yaml \
            --out-dir tests/e2e-gen \
            --base-url http://localhost:3000
        env:
          API_BASE_URL: http://localhost:3001
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/test_db

      - name: Run tests
        run: yarn test tests/e2e-gen
        env:
          E2E_BASE_URL: http://localhost:3000

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

### Multi-Environment Testing

Test across staging and production environments:

```yaml
name: E2E Tests (Multi-Env)

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        environment: [staging, production]
      fail-fast: false

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: yarn

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Load environment config
        run: |
          case "${{ matrix.environment }}" in
            staging)
              echo "E2E_BASE_URL=${{ secrets.STAGING_BASE_URL }}" >> $GITHUB_ENV
              echo "API_BASE_URL=${{ secrets.STAGING_API_URL }}" >> $GITHUB_ENV
              ;;
            production)
              echo "E2E_BASE_URL=${{ secrets.PROD_BASE_URL }}" >> $GITHUB_ENV
              echo "API_BASE_URL=${{ secrets.PROD_API_URL }}" >> $GITHUB_ENV
              ;;
          esac

      - name: Compile specs
        run: |
          yarn llm compile specs/*.txt \
            --pages pages.yaml \
            --out-dir tests/e2e-gen
        env:
          API_BASE_URL: ${{ env.API_BASE_URL }}

      - name: Run tests
        run: yarn test tests/e2e-gen
        env:
          E2E_BASE_URL: ${{ env.E2E_BASE_URL }}

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.environment }}
          path: playwright-report/
```

## GitLab CI Example

```yaml
stages:
  - compile
  - test
  - report

variables:
  YARN_CACHE_FOLDER: .yarn-cache
  PLAYWRIGHT_BROWSERS_PATH: /ms-playwright

cache:
  paths:
    - .yarn-cache
    - /ms-playwright

compile:specs:
  stage: compile
  image: node:18
  before_script:
    - yarn install --frozen-lockfile
    - npx playwright install --with-deps
  script:
    - |
      yarn llm compile specs/*.txt \
        --pages pages.yaml \
        --connectors connectors.yaml \
        --out-dir tests/e2e-gen
  artifacts:
    paths:
      - tests/e2e-gen/
    expire_in: 1 day
  only:
    - merge_requests
    - main

e2e:test:
  stage: test
  image: node:18
  dependencies:
    - compile:specs
  before_script:
    - yarn install --frozen-lockfile
    - npx playwright install --with-deps
  script:
    - yarn test tests/e2e-gen
  artifacts:
    when: always
    paths:
      - playwright-report/
    expire_in: 30 days
  only:
    - merge_requests
    - main

report:publish:
  stage: report
  image: node:18
  dependencies:
    - e2e:test
  script:
    - |
      echo "Test results available:"
      cat playwright-report/index.json | jq '.stats'
  artifacts:
    paths:
      - playwright-report/
    expire_in: 30 days
  only:
    - merge_requests
    - main
```

## BitBucket Pipelines Example

```yaml
image: node:18

definitions:
  caches:
    yarn: ~/.yarn-cache
    playwright: /ms-playwright

pipelines:
  pull-requests:
    '**':
      - step:
          name: Compile & Test
          caches:
            - yarn
            - playwright
          script:
            - yarn install --frozen-lockfile
            - npx playwright install --with-deps
            - |
              yarn llm compile specs/*.txt \
                --pages pages.yaml \
                --out-dir tests/e2e-gen
            - yarn test tests/e2e-gen
          artifacts:
            - playwright-report/**

  branches:
    main:
      - step:
          name: Compile & Test (Main)
          caches:
            - yarn
            - playwright
          script:
            - yarn install --frozen-lockfile
            - npx playwright install --with-deps
            - |
              yarn llm compile specs/*.txt \
                --pages pages.yaml \
                --out-dir tests/e2e-gen
            - yarn test tests/e2e-gen
          artifacts:
            - playwright-report/**
```

## Jenkins Example

```groovy
pipeline {
  agent any

  environment {
    E2E_BASE_URL = credentials('e2e-base-url')
    API_BASE_URL = credentials('api-base-url')
  }

  stages {
    stage('Install') {
      steps {
        sh 'yarn install --frozen-lockfile'
        sh 'npx playwright install --with-deps'
      }
    }

    stage('Compile') {
      steps {
        sh '''
          yarn llm compile specs/*.txt \
            --pages pages.yaml \
            --connectors connectors.yaml \
            --out-dir tests/e2e-gen
        '''
      }
    }

    stage('Verify') {
      steps {
        sh '''
          yarn llm verify \
            --base-url $E2E_BASE_URL \
            --spec-dir tests/e2e-gen
        '''
      }
    }

    stage('Test') {
      steps {
        sh 'yarn test tests/e2e-gen'
      }
    }
  }

  post {
    always {
      junit 'playwright-report/junit.xml'
      publishHTML([
        reportDir: 'playwright-report',
        reportFiles: 'index.html',
        reportName: 'Playwright Report'
      ])
    }
  }
}
```

## Best Practices

### 1. Fail Fast on Compile Errors

Stop the pipeline if specs don't compile:

```yaml
- name: Compile specs
  run: yarn llm compile specs/*.txt --pages pages.yaml --out-dir tests/e2e-gen
  # If this fails, the pipeline stops (default behavior)
```

### 2. Use Separate Secrets for Each Environment

```yaml
secrets:
  STAGING_BASE_URL: https://staging.example.com
  STAGING_API_URL: https://api-staging.example.com
  PROD_BASE_URL: https://app.example.com
  PROD_API_URL: https://api.example.com
```

Then reference them conditionally:

```yaml
- name: Compile specs
  env:
    E2E_BASE_URL: ${{ secrets.STAGING_BASE_URL }}
    API_BASE_URL: ${{ secrets.STAGING_API_URL }}
  run: yarn llm compile specs/*.txt --pages pages.yaml --out-dir tests/e2e-gen
```

### 3. Parallelize Test Runs

Split specs across multiple jobs:

```yaml
strategy:
  matrix:
    spec:
      - 'specs/login.txt'
      - 'specs/checkout.txt'
      - 'specs/user-profile.txt'

steps:
  - name: Compile spec
    run: yarn llm compile ${{ matrix.spec }} --pages pages.yaml --out-dir tests/e2e-gen

  - name: Run tests
    run: yarn test tests/e2e-gen
```

### 4. Cache Playwright Browsers

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 18
    cache: yarn  # Caches node_modules

- name: Cache Playwright
  uses: actions/cache@v3
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ hashFiles('**/package-lock.json') }}

- name: Install Playwright (if not cached)
  run: npx playwright install --with-deps
```

### 5. Retry Failed Tests

Some flakiness is expected in E2E testing. Retry once:

```yaml
- name: Run tests
  run: yarn test tests/e2e-gen --retries 1
```

Or use Playwright's built-in retry config:

```typescript
// playwright.config.ts
export default defineConfig({
  retries: process.env.CI ? 1 : 0,
});
```

### 6. Capture Artifacts on Failure

```yaml
- name: Upload artifacts on failure
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: test-artifacts
    path: |
      playwright-report/
      test-results/
    retention-days: 30
```

## Monitoring & Alerts

### Track Test Health Over Time

Create a dashboard showing pass rate, flakiness, and performance:

```yaml
- name: Parse test results
  if: always()
  run: |
    yarn node -e "
      const fs = require('fs');
      const report = JSON.parse(
        fs.readFileSync('playwright-report/index.json', 'utf8')
      );
      
      const metrics = {
        timestamp: new Date().toISOString(),
        passed: report.stats.expected,
        failed: report.stats.unexpected,
        duration: report.stats.duration,
        flaky: report.stats.flaky
      };
      
      console.log(JSON.stringify(metrics));
    "
```

### Alert on Selector Drift

If verification fails due to selectors:

```yaml
- name: Verify selectors
  id: verify
  run: yarn llm verify --base-url http://localhost:3000 --spec-dir tests/e2e-gen
  continue-on-error: true

- name: Alert on selector drift
  if: steps.verify.outcome == 'failure'
  run: |
    echo "⚠️ Selector verification failed!"
    echo "Check: tests/artifacts/verification-report.json"
    # Send Slack notification, etc.
```

## Troubleshooting

### Compile Fails in CI, Works Locally

**Cause**: Environment variables not set in CI.

**Fix**:
```yaml
- name: Compile specs
  run: yarn llm compile specs/*.txt --pages pages.yaml
  env:
    API_BASE_URL: ${{ secrets.API_BASE_URL }}  # ← Set in CI
```

### Tests Flake in CI, Stable Locally

**Cause**: Timing differences, network latency, or headless browser quirks.

**Fixes**:
1. Add explicit waits:
   ```plaintext
   - I wait for the loading spinner to disappear
   - I click the submit button
   ```

2. Increase timeout in `playwright.config.ts`:
   ```typescript
   actionTimeout: 10000,
   navigationTimeout: 30000,
   ```

3. Use `--retries 1` for flaky tests.

### Verification Passes Locally, Fails in CI

**Cause**: Different app state or network conditions in CI.

**Fix**:
1. Ensure app is fully started before verification:
   ```yaml
   - name: Wait for app
     run: npx wait-on http://localhost:3000 -t 60000
   ```

2. Check app logs:
   ```yaml
   - name: Show app logs on failure
     if: failure()
     run: docker logs <container-name>
   ```

## Next Steps

- Adapt one of the above workflows to your CI system.
- Add secret environment variables (API URLs, credentials).
- Set up artifact uploads for failure debugging.
- See [Selector Strategy](selector-strategy.md) for verification troubleshooting.
