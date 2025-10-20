#!/usr/bin/env node

import path from 'node:path';
import { validateAndFixSelectors, type SelectorValidationResult } from './validate-and-fix-selectors';
import { logEvent } from './utils/logging';

interface CliOptions {
  yamlPath: string;
  baseUrl?: string;
  autoFix?: boolean;
  headless?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const yamlPath = args[0];
  const baseUrl = getArgValue(args, '--base-url') ?? process.env.E2E_BASE_URL;
  const autoFix = args.includes('--auto-fix');
  const headless = !args.includes('--headed');

  return { yamlPath, baseUrl, autoFix, headless };
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

function printUsage(): void {
  console.log(`
Usage: yarn spec:validate-and-fix <yaml-path> [options]

Step 3.5: Validate selectors against running application

Arguments:
  <yaml-path>           Path to normalized YAML file (e.g., tests/normalized/example-login.yaml)

Options:
  --base-url <url>      Base URL of the running application (default: http://localhost:4200)
  --auto-fix            Automatically apply suggested fixes (requires confirmation)
  --headed              Run browser in headed mode (default: headless)
  -h, --help            Show this help message

Examples:
  # Validate selectors for login spec
  yarn spec:validate-and-fix tests/normalized/example-login.yaml

  # Validate with custom base URL
  yarn spec:validate-and-fix tests/normalized/example-login.yaml --base-url http://localhost:3000

  # Validate and show browser (for debugging)
  yarn spec:validate-and-fix tests/normalized/example-login.yaml --headed

  # Validate and apply fixes automatically
  yarn spec:validate-and-fix tests/normalized/example-login.yaml --auto-fix

Output:
  - Validation report: tests/artifacts/selector-validation-report.json
  - Console output with detailed feedback and suggested fixes
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('🔍 Step 3.5: Validating selectors against running application\n');
  console.log(`   YAML file: ${options.yamlPath}`);
  console.log(`   Base URL:  ${options.baseUrl ?? 'http://localhost:4200'}`);
  console.log(`   Auto-fix:  ${options.autoFix ? 'enabled' : 'disabled'}`);
  console.log('');

  const startTime = Date.now();

  try {
    const result = await validateAndFixSelectors(options);
    const duration = Date.now() - startTime;

    printReport(result);

    logEvent('selector-validation.complete', 'Selector validation completed', {
      yamlPath: options.yamlPath,
      valid: result.valid,
      missingCount: result.missingSelectors.length,
      existingCount: result.existingSelectors.length,
      durationMs: duration,
    });

    if (!result.valid) {
      console.log('\n❌ Validation failed. Please fix the missing selectors and re-run.\n');
      process.exit(1);
    }

    console.log('\n✅ All selectors validated successfully!\n');
    console.log('   You can now proceed to Step 4: Generate feature files');
    console.log(`   Run: yarn spec:features ${options.yamlPath}\n`);

  } catch (error) {
    console.error('\n❌ Validation failed with error:\n');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    
    logEvent('selector-validation.error', 'Selector validation failed', {
      yamlPath: options.yamlPath,
      error: error instanceof Error ? error.message : String(error),
    });

    process.exit(1);
  }
}

function printReport(result: SelectorValidationResult): void {
  console.log('─'.repeat(80));
  console.log('📊 Validation Report');
  console.log('─'.repeat(80));
  console.log('');

  if (result.valid) {
    console.log('✅ All selectors exist in the running application\n');
    console.log(`   Target page: ${result.targetPage}`);
    console.log(`   Validated:   ${result.existingSelectors.length} selectors`);
    console.log('');
    
    if (result.existingSelectors.length > 0) {
      console.log('   Existing selectors:');
      for (const selector of result.existingSelectors) {
        console.log(`     ✓ ${selector.id}`);
      }
    }
    
    return;
  }

  console.log('❌ Selector Validation Failed\n');
  console.log(`   Target page: ${result.targetPage}`);
  console.log(`   Missing:     ${result.missingSelectors.length} selectors`);
  console.log(`   Existing:    ${result.existingSelectors.length} selectors`);
  console.log('');

  console.log('Missing selectors:\n');

  for (const missing of result.missingSelectors) {
    console.log(`  ❌ ${missing.id}`);
    console.log(`     Referenced in steps:`);
    for (const step of missing.referencedInSteps) {
      console.log(`       - "${step}"`);
    }

    if (missing.suggestedFix) {
      const fix = missing.suggestedFix;
      console.log('');
      console.log(`     📝 Suggested fix:`);
      console.log(`        File: ${fix.componentPath}`);
      console.log(`        Current:  ${fix.currentCode}`);
      console.log(`        Add:      ${fix.suggestedCode}`);
    } else {
      console.log('');
      console.log(`     ⚠️  Could not auto-detect element. Manual inspection required.`);
    }

    console.log('');
  }

  console.log('─'.repeat(80));
  console.log('🔧 How to Fix');
  console.log('─'.repeat(80));
  console.log('');
  console.log('Option A: Manual Fix (Recommended)');
  console.log('  1. Review the suggested fixes above');
  console.log('  2. Open the component files in your editor');
  console.log('  3. Add the data-testid attributes as suggested');
  console.log('  4. Re-run validation: yarn spec:validate-and-fix ' + path.basename(result.targetPage));
  console.log('');
  console.log('Option B: Auto-fix (Experimental)');
  console.log('  1. Run with --auto-fix flag (requires confirmation)');
  console.log('  2. Review the generated git diff');
  console.log('  3. Commit the changes if they look correct');
  console.log('');
  console.log('Example fixes for common components:');
  console.log('');
  console.log('  React Hook Form Input:');
  console.log('    <Input');
  console.log('      {...register("email")}');
  console.log('      data-testid="email-input"  // Add this line');
  console.log('    />');
  console.log('');
  console.log('  Custom Button Component:');
  console.log('    <Button');
  console.log('      type="submit"');
  console.log('      data-testid="submit-button"  // Add this line');
  console.log('    >');
  console.log('      Sign in');
  console.log('    </Button>');
  console.log('');
  console.log('  Native HTML Input:');
  console.log('    <input');
  console.log('      type="password"');
  console.log('      data-testid="password-input"  // Add this line');
  console.log('    />');
  console.log('');
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

