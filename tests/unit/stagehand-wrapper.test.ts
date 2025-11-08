/*
  Focused unit tests for StagehandWrapper without real Playwright or Stagehand.
  We rely on a local mock module resolved via NODE_PATH=tests/mocks/node_modules.
*/
import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { StagehandWrapper } from '../scripts/stagehand/wrapper';

// Minimal fake Page object
const fakePage: any = { url: () => 'http://localhost/' };

// Pull mocked Stagehand from our local stub
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Stagehand } = require('@browserbasehq/stagehand');

function tmpCacheDir(name: string) {
  const p = join(process.cwd(), 'tests', 'tmp', name);
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true });
  }
  return p;
}

async function run() {
  // 1) observe caches and returns results
  {
    const cacheDir = tmpCacheDir('obs-cache');
    const wrapper = new StagehandWrapper(fakePage, new Stagehand(), {
      enableCache: true,
      cacheDir,
      authoringMode: true,
    });

    const first = await wrapper.observe('discover login fields');
    assert.equal(Array.isArray(first), true, 'observe returns array');
    assert.ok(first.length >= 2, 'observe returns at least two actions');

    const second = await wrapper.observe('discover login fields');
    assert.equal(second.length, first.length, 'cache hit returns same length');

    rmSync(cacheDir, { recursive: true, force: true });
  }

  // 2) act caches and returns metadata
  {
    const cacheDir = tmpCacheDir('act-cache');
    const wrapper = new StagehandWrapper(fakePage, new Stagehand(), {
      enableCache: true,
      cacheDir,
      authoringMode: true,
    });
    const meta1 = await wrapper.act('click Login');
    assert.equal(meta1.cached, false, 'first act is not cached');
    assert.ok(meta1.id && meta1.timestamp, 'act returns metadata');

    const meta2 = await wrapper.act('click Login');
    assert.equal(meta2.cached, true, 'second act is cached');
    assert.ok(meta2.cacheKey, 'cached act has cacheKey');

    rmSync(cacheDir, { recursive: true, force: true });
  }

  // 3) extract caches and returns validated structure + metadata
  {
    const cacheDir = tmpCacheDir('extract-cache');
    const wrapper = new StagehandWrapper(fakePage, new Stagehand(), {
      enableCache: true,
      cacheDir,
      authoringMode: true,
    });
    const result1 = await wrapper.extract('get status', { safeParse: () => ({ success: true }) } as any);
    assert.equal(result1._metadata.cached, false, 'first extract not cached');
    const result2 = await wrapper.extract('get status', { safeParse: () => ({ success: true }) } as any);
    assert.equal(result2._metadata.cached, true, 'second extract cached');

    rmSync(cacheDir, { recursive: true, force: true });
  }

  // 4) CI guard blocks uncached calls when authoringMode=false
  {
    const prev = process.env.CI;
    process.env.CI = 'true';
    const cacheDir = tmpCacheDir('ci-guard');
    const wrapper = new StagehandWrapper(fakePage, new Stagehand(), {
      enableCache: true,
      cacheDir,
      authoringMode: false,
    });

    let threw = false;
    try {
      await wrapper.observe('uncached call should fail in CI');
    } catch (e) {
      threw = true;
      assert.match(String(e), /Authoring disabled in CI/);
    }
    assert.equal(threw, true, 'CI guard must throw on cache miss');

    process.env.CI = prev;
    rmSync(cacheDir, { recursive: true, force: true });
  }

  // 5) With authoringMode=true in CI, uncached calls are allowed
  {
    const prev = process.env.CI;
    process.env.CI = 'true';
    const cacheDir = tmpCacheDir('ci-authoring');
    const wrapper = new StagehandWrapper(fakePage, new Stagehand(), {
      enableCache: true,
      cacheDir,
      authoringMode: true,
    });

    const actions = await wrapper.observe('allowed in CI with authoringMode');
    assert.ok(actions.length > 0, 'actions returned');

    process.env.CI = prev;
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('StagehandWrapper unit tests passed');
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });

