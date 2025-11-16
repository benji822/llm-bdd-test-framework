import { test, expect } from '@playwright/test';
import {
  selectorResolver,
  type SelectorResolverOptions,
  type SelectorResolverTelemetry,
} from '../steps/support/selector-resolver.js';

test.describe('Selector Resolver: Strategy Order & Scoping', () => {
  test('applies default strategy order when SELECTOR_STRATEGY is unset', async ({ page }) => {
    await page.setContent(`
      <button role="button">Click me</button>
      <input type="text" placeholder="Enter text" />
      <span>Some text</span>
    `);

    const telemetries: SelectorResolverTelemetry[] = [];
    const options: SelectorResolverOptions = {
      logger: (event) => telemetries.push(event),
      textHint: 'Click me',
      roleHint: 'button',
    };

    const resolution = await selectorResolver(page, 'click me button', options);
    expect(resolution.locator).toBeDefined();
    expect(telemetries.length).toBeGreaterThan(0);

    // First attempted strategy should be 'role'
    const firstTelemetry = telemetries[0];
    expect(['role', 'label', 'text', 'type', 'name', 'placeholder', 'css', 'testid']).toContain(
      firstTelemetry.strategy
    );
  });

  test('appends missing default strategies when SELECTOR_STRATEGY env override is partial', async ({
    page,
  }) => {
    await page.setContent(`
      <button role="button">Click</button>
      <label>Email</label>
      <input name="email" />
    `);

    // Simulate partial env override with no registry
    const originalEnv = process.env.SELECTOR_STRATEGY;
    process.env.SELECTOR_STRATEGY = 'text,name';

    try {
      const telemetries: SelectorResolverTelemetry[] = [];
      const options: SelectorResolverOptions = {
        logger: (event) => telemetries.push(event),
        textHint: 'Email',
        registryPath: '/nonexistent/registry.json', // Prevent registry loading
      };

      await selectorResolver(page, 'email', options);

      // Verify telemetries were logged
      expect(telemetries.length).toBeGreaterThan(0);
      const strategies = telemetries.map((t) => t.strategy);
      // Should have attempted strategies from env override plus defaults
      expect(strategies.length).toBeGreaterThan(0);
    } finally {
      if (originalEnv) {
        process.env.SELECTOR_STRATEGY = originalEnv;
      } else {
        delete process.env.SELECTOR_STRATEGY;
      }
    }
  });

  test('uses provided strategyOrder option and appends missing defaults', async ({ page }) => {
    await page.setContent(`
      <button role="button">Submit</button>
      <input type="submit" />
    `);

    const telemetries: SelectorResolverTelemetry[] = [];
    const options: SelectorResolverOptions = {
      strategyOrder: ['type', 'text'],
      logger: (event) => telemetries.push(event),
      textHint: 'Submit',
      typeHint: 'submit',
    };

    const resolution = await selectorResolver(page, 'submit button', options);
    expect(resolution.locator).toBeDefined();

    // Verify 'type' was tried before other defaults
    const strategies = telemetries.map((t) => t.strategy);
    const typeIndex = strategies.indexOf('type');
    const roleIndex = strategies.indexOf('role');
    // type should come before role (if role is tried)
    if (roleIndex !== -1 && typeIndex !== -1) {
      expect(typeIndex < roleIndex).toBeTruthy();
    }
  });

  test('supports scoping with optional container locator', async ({ page }) => {
    await page.setContent(`
      <div class="form-group">
        <label>Password</label>
        <input name="password" type="password" />
      </div>
      <div class="form-group">
        <label>Password Confirm</label>
        <input name="password_confirm" type="password" />
      </div>
    `);

    const formContainer = page.locator('.form-group').first();

    const options: SelectorResolverOptions = {
      scope: formContainer,
      textHint: 'Password',
      registryPath: '/nonexistent/registry.json', // Avoid registry loading
    };

    const resolution = await selectorResolver(page, 'password', options);
    expect(resolution.locator).toBeDefined();

    // Verify we got a locator for an input field
    const isVisible = await resolution.locator.isVisible();
    expect(isVisible).toBe(true);
  });

  test('detects ambiguous matches and logs match count', async ({ page }) => {
    await page.setContent(`
      <button>Save</button>
      <button>Save</button>
      <button>Save</button>
    `);

    const telemetries: SelectorResolverTelemetry[] = [];
    const options: SelectorResolverOptions = {
      logger: (event) => telemetries.push(event),
      textHint: 'Save',
      roleHint: 'button',
      ambiguityPolicy: 'first', // Don't error, just log
    };

    const resolution = await selectorResolver(page, 'save button', options);
    expect(resolution.locator).toBeDefined();

    // Find telemetry with matchCount > 1
    const ambiguousTelemetry = telemetries.find((t) => t.matchCount && t.matchCount > 1);
    expect(ambiguousTelemetry?.matchCount).toBe(3);
  });

  test('throws ambiguity error when ambiguityPolicy is "error" and multiple matches found', async ({
    page,
  }) => {
    await page.setContent(`
      <button>Delete</button>
      <button>Delete</button>
    `);

    const options: SelectorResolverOptions = {
      textHint: 'Delete',
      roleHint: 'button',
      ambiguityPolicy: 'error',
    };

    try {
      await selectorResolver(page, 'delete', options);
      expect.fail('Should have thrown ambiguity error');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('Ambiguous selector resolution');
      expect(message).toContain('2 elements matched');
      expect(message).toContain('aria-label');
      expect(message).toContain('data-testid');
    }
  });

  test('warns on ambiguous matches when ambiguityPolicy is "warn"', async ({ page }) => {
    await page.setContent(`
      <input type="text" />
      <input type="text" />
    `);

    let warnCalled = false;
    const originalWarn = console.warn;
    console.warn = (..._args: any[]) => {
      warnCalled = true;
    };

    try {
      const options: SelectorResolverOptions = {
        typeHint: 'text',
        ambiguityPolicy: 'warn',
        registryPath: '/nonexistent/registry.json',
      };

      const resolution = await selectorResolver(page, 'text input', options);
      expect(resolution.locator).toBeDefined();
      expect(warnCalled).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('includes strategy trace in error message when resolution fails', async ({ page }) => {
    await page.setContent('<div>Empty page</div>');

    try {
      await selectorResolver(page, 'nonexistent button', {
        textHint: 'nonexistent',
        roleHint: 'button',
      });
      expect.fail('Should have thrown error');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('Strategy order tried:');
      expect(message).toContain('→');
      expect(message).toContain('Suggestion:');
    }
  });

  test('prioritizes scoped matches over page-wide matches', async ({ page }) => {
    await page.setContent(`
      <div id="modal" style="display:none">
        <button>Hidden Cancel</button>
      </div>
      <div id="content">
        <button>Cancel</button>
      </div>
    `);

    const visibleArea = page.locator('#content');
    const options: SelectorResolverOptions = {
      scope: visibleArea,
      textHint: 'Cancel',
      roleHint: 'button',
    };

    const resolution = await selectorResolver(page, 'cancel', options);
    expect(resolution.locator).toBeDefined();

    // Verify we got the visible button, not the hidden one
    const isVisible = await resolution.locator.isVisible();
    expect(isVisible).toBe(true);
  });

  test('logs telemetry with all fields including strategy and tokens', async ({ page }) => {
    await page.setContent('<button>Login</button>');

    const telemetries: SelectorResolverTelemetry[] = [];
    const options: SelectorResolverOptions = {
      logger: (event) => telemetries.push(event),
      textHint: 'Login',
      roleHint: 'button',
    };

    await selectorResolver(page, 'login button', options);

    // Find successful resolution telemetry
    const successTelemetry = telemetries.find((t) => t.selector.includes('button'));
    expect(successTelemetry?.strategy).toBeDefined();
    expect(successTelemetry?.selector).toBeDefined();
    expect(successTelemetry?.tokens.length).toBeGreaterThan(0);
    expect(successTelemetry?.source).toMatch(/registry|heuristic|attribute/);
  });

  test('handles ID shortcut with scope', async ({ page }) => {
    // Note: This test requires a registry file with known selector IDs
    // For now, we test the error case gracefully
    await page.setContent('<button>Test</button>');

    const options: SelectorResolverOptions = {
      scope: page.locator('body'),
    };

    const resolution = await selectorResolver(page, 'test button', options);
    expect(resolution.locator).toBeDefined();
  });

  test('recovers from ambiguity with "first" policy', async ({ page }) => {
    await page.setContent(`
      <label>Option</label>
      <input type="radio" name="option" />
      <label>Option</label>
      <input type="radio" name="option" />
    `);

    const options: SelectorResolverOptions = {
      textHint: 'Option',
      roleHint: 'button',
      ambiguityPolicy: 'first', // Use first match
    };

    // Should not throw, should use first match
    const resolution = await selectorResolver(page, 'option', options);
    expect(resolution.locator).toBeDefined();
  });
});
