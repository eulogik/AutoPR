import { readFile, writeFile, access, mkdir } from "fs/promises";
import { constants } from "fs";
import { createHash } from "crypto";
import { resolve } from "path";

export interface CacheEntry {
  key: string;
  response: unknown;
  timestamp: number;
  ttl: number;
}

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export class Cache {
  private cacheDir: string;

  constructor(cacheDir: string = ".autopr/cache") {
    this.cacheDir = cacheDir;
  }

  private getCachePath(key: string): string {
    const hash = createHash("sha256").update(key).digest("hex");
    return resolve(process.cwd(), this.cacheDir, `${hash}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    const cachePath = this.getCachePath(key);
    try {
      await access(cachePath, constants.F_OK);
      const content = await readFile(cachePath, "utf-8");
      const entry: CacheEntry = JSON.parse(content);

      if (Date.now() - entry.timestamp > entry.ttl) {
        return null; // Expired
      }

      return entry.response as T;
    } catch {
      return null;
    }
  }

  async set(key: string, response: unknown, ttl: number = DEFAULT_TTL_MS): Promise<void> {
    const cachePath = this.getCachePath(key);
    try {
      await mkdir(resolve(process.cwd(), this.cacheDir), { recursive: true });
    } catch {
      // Directory might already exist
    }

    const entry: CacheEntry = {
      key,
      response,
      timestamp: Date.now(),
      ttl,
    };

    await writeFile(cachePath, JSON.stringify(entry, null, 2), "utf-8");
  }

  async invalidate(key: string): Promise<void> {
    const { unlink } = await import("fs/promises");
    const cachePath = this.getCachePath(key);
    try {
      await unlink(cachePath);
    } catch {
      // File might not exist
    }
  }

  static createKey(prefix: string, data: unknown): string {
    return `${prefix}:${JSON.stringify(data)}`;
  }
}
