import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Cache } from "../cache.js";
import { readFile, rm } from "fs/promises";
import { resolve } from "path";

describe("Cache", () => {
  const testCacheDir = ".autopr/cache";
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache(testCacheDir);
  });

  afterEach(async () => {
    try {
      await rm(resolve(process.cwd(), testCacheDir), { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("should set and get cache entries", async () => {
    const key = "test-key";
    const value = { data: "test-value" };

    await cache.set(key, value);
    const result = await cache.get<typeof value>(key);

    expect(result).toEqual(value);
  });

  it("should return null for missing keys", async () => {
    const result = await cache.get("non-existent");
    expect(result).toBeNull();
  });

  it("should return null for expired entries", async () => {
    const key = "expiring-key";
    const value = { data: "test" };

    await cache.set(key, value, 1); // 1ms TTL

    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = await cache.get(key);
    expect(result).toBeNull();
  });

  it("should create consistent cache keys", () => {
    const key1 = Cache.createKey("prefix", { a: 1 });
    const key2 = Cache.createKey("prefix", { a: 1 });
    expect(key1).toBe(key2);
  });

  it("should invalidate cache entries", async () => {
    const key = "invalidate-test";
    await cache.set(key, "value");

    let result = await cache.get(key);
    expect(result).toBe("value");

    await cache.invalidate(key);
    result = await cache.get(key);
    expect(result).toBeNull();
  });
});
