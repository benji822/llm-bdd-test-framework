import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface CacheEntry {
  key: string;
  value: unknown;
  timestamp: string;
  instruction?: string;
}

/**
 * Simple disk-based cache for Stagehand observations and actions
 */
export class StagehandCache {
  private cacheDir: string;
  private cacheFile: string;
  private entries: Map<string, CacheEntry> = new Map();

  constructor(cacheDir: string = '.stagehand-cache') {
    this.cacheDir = cacheDir;
    this.cacheFile = path.join(cacheDir, 'cache.ndjson');
    this.ensureCacheDir();
    this.loadCache();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate cache key from instruction and context
   */
  public generateKey(instruction: string, context?: string): string {
    const combined = `${instruction}:${context || ''}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Get cached value by key
   */
  public get(key: string): unknown | null {
    const entry = this.entries.get(key);
    if (entry) {
      return entry.value;
    }
    return null;
  }

  /**
   * Set cache entry
   */
  public set(key: string, value: unknown, instruction?: string): void {
    const entry: CacheEntry = {
      key,
      value,
      timestamp: new Date().toISOString(),
      instruction,
    };
    this.entries.set(key, entry);
    this.persistEntry(entry);
  }

  /**
   * Check if key exists in cache
   */
  public has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Clear all cache
   */
  public clear(): void {
    this.entries.clear();
    if (fs.existsSync(this.cacheFile)) {
      fs.unlinkSync(this.cacheFile);
    }
  }

  private loadCache(): void {
    if (!fs.existsSync(this.cacheFile)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.cacheFile, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        const entry: CacheEntry = JSON.parse(line);
        this.entries.set(entry.key, entry);
      }
    } catch (error) {
      console.error(`Failed to load cache from ${this.cacheFile}`, error);
    }
  }

  private persistEntry(entry: CacheEntry): void {
    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.cacheFile, line, 'utf-8');
    } catch (error) {
      console.error('Failed to persist cache entry', error);
    }
  }
}
