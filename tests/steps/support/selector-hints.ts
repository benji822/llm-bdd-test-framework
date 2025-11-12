import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ActionGraph, SelectorRef } from '../../scripts/action-graph/types';

const GRAPH_DIR = path.resolve('tests/artifacts/graph');

interface SelectorHintPayload {
  selectorId?: string;
  locator?: string;
  selectors?: SelectorRef[];
  textHint?: string;
  typeHint?: string;
  roleHint?: string;
}

const hintCache = new Map<string, Promise<SelectorHintPayload[]>>();

async function loadHintsForFeature(featureUri: string): Promise<SelectorHintPayload[]> {
  const absoluteFeaturePath = path.resolve(featureUri);
  let cached = hintCache.get(absoluteFeaturePath);
  if (cached) {
    return cached;
  }

  cached = (async () => {
    const content = await fs.readFile(absoluteFeaturePath, 'utf-8');
    const specId = parseSpecId(content);
    if (!specId) {
      return [];
    }

    const graphPath = await findLatestGraphPath(specId);
    if (!graphPath) {
      return [];
    }

    const raw = await fs.readFile(graphPath, 'utf-8');
    const graph = JSON.parse(raw) as ActionGraph;
    return buildHints(graph);
  })();

  hintCache.set(absoluteFeaturePath, cached);
  return cached;
}

export async function getSelectorHint(
  featureUri: string | undefined,
  stepIndex: number
): Promise<SelectorHintPayload | undefined> {
  if (!featureUri || stepIndex < 0) {
    return undefined;
  }

  const hints = await loadHintsForFeature(featureUri);
  return hints[stepIndex];
}

function parseSpecId(featureContent: string): string | undefined {
  const match = featureContent.match(/^#\s*specId:\s*(.+)$/m);
  return match ? match[1].trim() : undefined;
}

async function findLatestGraphPath(specId: string): Promise<string | undefined> {
  try {
    const files = await fs.readdir(GRAPH_DIR);
    const matcher = new RegExp(`^${escapeRegExp(specId)}__.+__v(\\d+)\\.json$`);
    let best: { version: number; filePath: string } | undefined;
    for (const file of files) {
      const match = file.match(matcher);
      if (!match) {
        continue;
      }
      const version = Number(match[1]);
      if (Number.isNaN(version)) {
        continue;
      }
      if (!best || version > best.version) {
        best = {
          version,
          filePath: path.join(GRAPH_DIR, file),
        };
      }
    }
    return best?.filePath;
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildHints(graph: ActionGraph): SelectorHintPayload[] {
  const hints: SelectorHintPayload[] = [];
  for (const node of graph.nodes) {
    if (typeof node.stepIndex !== 'number' || node.stepIndex < 0) {
      continue;
    }
    const deterministicSelector = node.instructions?.deterministic?.selector;
    const selectors = node.selectors?.filter((selector) => Boolean(selector?.id)) as SelectorRef[] | undefined;
    const hint: SelectorHintPayload = {};

    if (selectors?.length) {
      hint.selectors = selectors;
      hint.selectorId = selectors[0].id;
      hint.locator = selectors[0].locator ?? deterministicSelector;
    }

    if (!hint.selectorId && deterministicSelector) {
      hint.selectorId = deterministicSelector;
    }
    if (!hint.locator && deterministicSelector) {
      hint.locator = deterministicSelector;
    }

    if (node.metadata?.selectorHintText) {
      hint.textHint = node.metadata.selectorHintText;
    }
    if (node.metadata?.selectorHintType) {
      hint.typeHint = node.metadata.selectorHintType;
    }
    if (node.metadata?.selectorHintRole) {
      hint.roleHint = node.metadata.selectorHintRole;
    }

    hints[node.stepIndex] = hint;
  }

  return hints;
}

export type { SelectorHintPayload };
