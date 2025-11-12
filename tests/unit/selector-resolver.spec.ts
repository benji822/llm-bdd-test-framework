import { expect, test } from '@playwright/test';
import { selectorResolver } from '../steps/support/selector-resolver';

test.describe('selector resolver text heuristics', () => {
  test('clicks LOG IN button via text strategy', async ({ page }) => {
    await page.setContent(`<!DOCTYPE html>
      <html>
        <body>
          <button class="inline-flex text-white items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary-700 [@media(pointer:fine)]:hover:bg-primary-600 active:!bg-primary-800 h-10 px-4 py-2 w-full max-w-none" type="submit">
            <div class="text-[16px] leading-[24px] font-bold font-barbieri tracking-normal">LOG IN</div>
          </button>
        </body>
      </html>
    `);

    const resolution = await selectorResolver(page, 'submit', {
      expectedTagNames: ['button'],
      strategyOrder: ['text', 'type', 'role', 'label', 'css', 'testid'],
      textHint: 'LOG IN',
    });

    await expect(resolution.locator).toBeVisible();
    await resolution.locator.click();
    expect(resolution.telemetry.strategy).toBe('text');
  });
});
