import { promises as fs } from 'fs';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { ActionGraph, GraphPersistenceOptions } from './types.js';

const SCENARIO_DELIMITER = '__';

/**
 * Manages persistence of action graphs to disk.
 * Graphs are stored as JSON with automatic versioning support.
 */
export class GraphPersistence {
  private baseDir: string;
  private versioned: boolean;

  constructor(options?: GraphPersistenceOptions) {
    this.baseDir = options?.graphDir || 'tests/artifacts/graph';
    this.versioned = options?.versioned ?? true;
  }

  /**
   * Save an action graph to disk
   */
  async write(graph: ActionGraph): Promise<string> {
    await this.ensureDir();

    if (!graph.metadata.scenarioName) {
      throw new Error('scenarioName is required on graph metadata');
    }

    const scenarioKey = this.toScenarioKey(graph.metadata.scenarioName);
    const fileName = this.versioned
      ? `${graph.metadata.specId}${SCENARIO_DELIMITER}${scenarioKey}${SCENARIO_DELIMITER}v${Date.now()}.json`
      : `${graph.metadata.specId}${SCENARIO_DELIMITER}${scenarioKey}.json`;

    const filePath = `${this.baseDir}/${fileName}`;
    const content = JSON.stringify(graph, null, 2);

    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Read a graph by specId (latest version if versioned)
   */
  async read(specId: string, scenarioName?: string): Promise<ActionGraph | null> {
    await this.ensureDir();

    const versions = await this.listBySpec(specId, scenarioName);
    if (versions.length === 0) {
      return null;
    }

    this.assertScenarioDisambiguated(specId, versions, scenarioName);

    const latestFile = versions[0];
    const filePath = `${this.baseDir}/${latestFile}`;
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ActionGraph;
  }

  /**
   * List all graphs for a specification
   */
  async listBySpec(specId: string, scenarioName?: string): Promise<string[]> {
    await this.ensureDir();

    const scenarioPrefix = scenarioName ? this.toScenarioKey(scenarioName) : undefined;
    const files = await fs.readdir(this.baseDir);
    return files
      .filter((f) => this.matchesSpecAndScenario(f, specId, scenarioPrefix))
      .sort()
      .reverse();
  }

  /**
   * Delete a specific graph file
   */
  async delete(fileName: string): Promise<void> {
    const filePath = `${this.baseDir}/${fileName}`;
    await fs.unlink(filePath);
  }

  /**
   * Clear all graphs (use with caution)
   */
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.baseDir);
      await Promise.all(
        files
          .filter((f) => f.endsWith('.json'))
          .map((f) => fs.unlink(`${this.baseDir}/${f}`))
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private matchesSpecAndScenario(file: string, specId: string, scenarioKey?: string): boolean {
    if (!file.endsWith('.json')) {
      return false;
    }

    const prefix = `${specId}${SCENARIO_DELIMITER}`;
    if (!file.startsWith(prefix)) {
      return false;
    }

    if (!scenarioKey) {
      return true;
    }

    return file.startsWith(`${prefix}${scenarioKey}`);
  }

  private toScenarioKey(name: string): string {
    const slug = slugify(name);
    return slug || 'scenario';
  }

  private extractScenarioKey(fileName: string): string | null {
    const firstSeparator = fileName.indexOf(SCENARIO_DELIMITER);
    if (firstSeparator === -1) {
      return null;
    }

    const secondSeparator = fileName.indexOf(
      SCENARIO_DELIMITER,
      firstSeparator + SCENARIO_DELIMITER.length
    );

    if (secondSeparator === -1) {
      return fileName
        .slice(firstSeparator + SCENARIO_DELIMITER.length)
        .replace(/\.json$/, '');
    }

    return fileName.slice(firstSeparator + SCENARIO_DELIMITER.length, secondSeparator);
  }

  private assertScenarioDisambiguated(
    specId: string,
    versions: string[],
    scenarioName?: string
  ): void {
    if (scenarioName) {
      return;
    }

    const scenarioKeys = new Set(
      versions
        .map((file) => this.extractScenarioKey(file))
        .filter((key): key is string => Boolean(key))
    );

    if (scenarioKeys.size > 1) {
      throw new Error(
        `Multiple scenarios found for spec ${specId}. Provide scenarioName to read a specific graph.`
      );
    }
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }
}

/**
 * Helper to generate a new graph ID
 */
export function generateGraphId(): string {
  return uuidv4();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
