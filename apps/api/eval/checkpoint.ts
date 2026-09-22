/**
 * Saves each answer as soon as it arrives, so a run cut short by a quota limit
 * or Ctrl+C can continue later without asking the model the same questions
 * again. One file per detector + model + prompt version; deleted when a run
 * completes, so the next run starts fresh.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Checkpoint, SavedAnswer } from './run.js';

export function fileCheckpoint(path: string): Checkpoint & {
  count(): Promise<number>;
  clear(): Promise<void>;
} {
  let cache: Record<string, SavedAnswer> | null = null;
  async function load() {
    if (cache) return cache;
    try {
      cache = JSON.parse(await readFile(path, 'utf8')) as Record<string, SavedAnswer>;
    } catch {
      cache = {};
    }
    return cache;
  }
  return {
    async get(key) {
      return (await load())[key] ?? null;
    },
    async save(key, answer) {
      const all = await load();
      all[key] = answer;
      await mkdir(dirname(path), { recursive: true });
      // Write-then-rename would be safer, but a lost checkpoint only costs a re-ask.
      await writeFile(path, JSON.stringify(all));
    },
    async count() {
      return Object.keys(await load()).length;
    },
    async clear() {
      cache = {};
      await rm(path, { force: true });
    },
  };
}
