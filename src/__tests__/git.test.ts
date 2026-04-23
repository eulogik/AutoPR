import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { sanitizeDiff, calculateComplexityScore, parseGitHubUrl } from "../git.js";
import { writeFile, unlink } from "fs/promises";
import { resolve } from "path";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);

describe("Git Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sanitizeDiff", () => {
    it("should redact API keys", () => {
      const diff = `diff --git a/.env b/.env
+API_KEY=sk-1234567890abcdef1234567890abcdef
+SECRET=mysecretvalue`;
      const sanitized = sanitizeDiff(diff);
      expect(sanitized).not.toContain("sk-1234567890");
      expect(sanitized).toContain("[REDACTED]");
    });

    it("should redact GitHub tokens", () => {
      const diff = `diff --git a/.env b/.env
+GITHUB_TOKEN=ghp_123456789012345678901234567890123456`;
      const sanitized = sanitizeDiff(diff);
      expect(sanitized).not.toContain("ghp_1234");
      expect(sanitized).toContain("[REDACTED]");
    });

    it("should redact .env references", () => {
      const diff = `diff --git a/config b/config
+require('.env')`;
      const sanitized = sanitizeDiff(diff);
      expect(sanitized).toContain("[REDACTED]");
    });
  });

  describe("calculateComplexityScore", () => {
    it("should calculate score based on file count", () => {
      const diff = {
        files: Array(10).fill(0).map((_, i) => `file${i}.ts`),
        insertions: 0,
        deletions: 0,
        diff: "",
        changeTypes: {},
      };
      const score = calculateComplexityScore(diff);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(10);
    });

    it("should factor in line changes", () => {
      const diff = {
        files: ["file.ts"],
        insertions: 500,
        deletions: 300,
        diff: "",
        changeTypes: {},
      };
      const score = calculateComplexityScore(diff);
      expect(score).toBeGreaterThan(3);
    });
  });

  describe("parseGitHubUrl", () => {
    it("should parse HTTPS URLs", () => {
      const url = "https://github.com/owner/repo.git";
      const result = parseGitHubUrl(url);
      expect(result).toEqual({ owner: "owner", repo: "repo" });
    });

    it("should parse SSH URLs", () => {
      const url = "git@github.com:owner/repo.git";
      const result = parseGitHubUrl(url);
      expect(result).toEqual({ owner: "owner", repo: "repo" });
    });

    it("should handle URLs without .git", () => {
      const url = "https://github.com/owner/repo";
      const result = parseGitHubUrl(url);
      expect(result).toEqual({ owner: "owner", repo: "repo" });
    });

    it("should return null for non-GitHub URLs", () => {
      const url = "https://gitlab.com/owner/repo";
      const result = parseGitHubUrl(url);
      expect(result).toBeNull();
    });
  });
});
