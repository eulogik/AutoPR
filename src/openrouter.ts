import { Cache } from "./cache.js";
import { createHash } from "crypto";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class RateLimiter {
  private calls: number[] = [];
  private maxCalls: number;
  private windowMs: number;

  constructor(maxCallsPerMinute: number = 10) {
    this.maxCalls = maxCallsPerMinute;
    this.windowMs = 60 * 1000;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    this.calls = this.calls.filter((t) => now - t < this.windowMs);

    if (this.calls.length >= this.maxCalls) {
      const oldestCall = this.calls[0];
      const waitTime = this.windowMs - (now - oldestCall);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return this.acquire();
    }

    this.calls.push(now);
  }
}

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string = "https://openrouter.ai/api/v1";
  private rateLimiter: RateLimiter;
  private cache: Cache | undefined;

  constructor(apiKey: string, rateLimitPerMinute: number = 10, cache?: Cache) {
    this.apiKey = apiKey;
    this.rateLimiter = new RateLimiter(rateLimitPerMinute);
    this.cache = cache;
  }

  async chat(request: OpenRouterRequest): Promise<string> {
    const cacheKey = Cache.createKey("openrouter", request);
    const cache = this.cache;

    if (cache !== undefined) {
      const cached = await cache.get<string>(cacheKey);
      if (cached !== null) return cached;
    }

    await this.rateLimiter.acquire();

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/autopr/autopr",
        "X-Title": "AutoPR",
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.1,
        max_tokens: request.max_tokens,
        top_p: request.top_p ?? 1,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${error}`);
    }

    const data: OpenRouterResponse = await response.json();

    if (!data.choices?.[0]?.message?.content) {
      throw new Error("Invalid response from OpenRouter API");
    }

    const content = data.choices[0].message.content;

    if (this.cache) {
      await this.cache.set(cacheKey, content);
    }

    return content;
  }

  async withRetry<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
      }
    }

    throw lastError;
  }
}
