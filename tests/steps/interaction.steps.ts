import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import type { SelectorResolverOptions } from './support/selector-resolver';
import { selectorResolver } from './support/selector-resolver';
import { getSelectorHint, type SelectorHintPayload } from './support/selector-hints';

type StepFixtures = {
  page: Page;
  $uri?: string;
  $bddContext?: { stepIndex: number };
};

const { When } = createBdd();

async function resolveWithHint(
  fixtures: StepFixtures,
  fallback: string,
  options?: SelectorResolverOptions
): Promise<Locator> {
  const stepIndex = fixtures.$bddContext?.stepIndex ?? 0;
  const hint: SelectorHintPayload | undefined = await getSelectorHint(fixtures.$uri, stepIndex);
  if (hint?.locator) {
    const direct = fixtures.page.locator(hint.locator);
    if (await direct.count()) {
      return direct;
    }
  }

  const target = hint?.selectorId ?? fallback;
  const resolverOptions: SelectorResolverOptions = {
    ...options,
    textHint: hint?.textHint ?? options?.textHint,
    typeHint: hint?.typeHint ?? options?.typeHint,
    roleHint: hint?.roleHint ?? options?.roleHint,
  };
  const resolution = await selectorResolver(fixtures.page, target, resolverOptions);
  return resolution.locator;
}

When(
  'I enter {word} as {string}',
  async ({ page, $uri, $bddContext }: StepFixtures, field: string, value: string) => {
    const locator = await resolveWithHint(
      { page, $uri, $bddContext },
      field,
      { expectedTagNames: ['input', 'textarea'] }
    );
    await locator.fill(value);
  }
);

When(
  'I enter {word} as <{word}>',
  async ({ page, $uri, $bddContext }: StepFixtures, field: string, placeholder: string) => {
    const key = placeholder.trim();
    const value = process.env[key] ?? '';
    const locator = await resolveWithHint(
      { page, $uri, $bddContext },
      field,
      { expectedTagNames: ['input', 'textarea'] }
    );
    await locator.fill(value);
  }
);

When(
  'I select {word} as {string}',
  async ({ page, $uri, $bddContext }: StepFixtures, field: string, value: string) => {
    const locator = await resolveWithHint(
      { page, $uri, $bddContext },
      field,
      { expectedTagNames: ['select'] }
    );
    await locator.selectOption({ label: value });
  }
);

When(
  'I select {word} as <{word}>',
  async ({ page, $uri, $bddContext }: StepFixtures, field: string, placeholder: string) => {
    const key = placeholder.trim();
    const value = process.env[key] ?? '';
    const locator = await resolveWithHint(
      { page, $uri, $bddContext },
      field,
      { expectedTagNames: ['select'] }
    );
    await locator.selectOption({ label: value });
  }
);

When(
  'I click the {word} button',
  async ({ page, $uri, $bddContext }: StepFixtures, element: string) => {
    const locator = await resolveWithHint({ page, $uri, $bddContext }, element);
    await locator.click();
  }
);
