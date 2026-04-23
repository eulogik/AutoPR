import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterClient, RateLimiter } from "../openrouter.js";
import { Cache } from "../cache.js";

vi.mock("fetch", () => ({
  default: vi.fn(),
}));

describe("RateLimiter", () => {
  it("should allow calls within limit", async () => {
    const limiter = new RateLimiter(10);
    // Should not throw
    await limiter.acquire();
    await limiter.acquire();
  });

  it("should block when limit exceeded", async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(2);

    await limiter.acquire();
    await limiter.acquire();
    const acquirePromise = limiter.acquire();

    // Should not resolve immediately
    let resolved = false;
    void acquirePromise.then(() => { resolved = true; });
    await vi.advanceTimersByTime(100);
    expect(resolved).toBe(false);

    // After window passes, should resolve
    await vi.advanceTimersByTime(60 * 1000);
    await expect(acquirePromise).resolves.toBeUndefined();

    vi.useRealTimers();
  });
});

describe("OpenRouterClient", () => {
  let client: OpenRouterClient;
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache(".autopr/cache");
    client = new OpenRouterClient("test-key", 10, cache);
  });

  it("should retry on failure", async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) throw new Error("Temporary failure");
      return "success";
    });

    const result = await client.withRetry(fn, 3);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should throw after max retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Permanent failure"));

    await expect(client.withRetry(fn, 2)).rejects.toThrow("Permanent failure");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
