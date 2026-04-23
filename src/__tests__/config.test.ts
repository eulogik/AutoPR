import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, saveConfig, mergeConfig, getModelForTask, type AutoPRConfig } from "../config.js";
import { writeFile, unlink } from "fs/promises";
import { resolve } from "path";

const TEST_CONFIG_PATH = resolve(process.cwd(), ".autopr.json");

describe("Config", () => {
  beforeEach(async () => {
    try {
      await unlink(TEST_CONFIG_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    try {
      await unlink(TEST_CONFIG_PATH);
    } catch {
      // Ignore
    }
  });

  it("should load default config when no config file exists", async () => {
    const config = await loadConfig();
    expect(config.model.fast).toBe("google/gemma-4-31b-it:free");
    expect(config.model.temperature).toBe(0.1);
    expect(config.dryRun).toBe(true);
    expect(config.style.conventionalCommits).toBe(true);
  });

  it("should merge user config with defaults", async () => {
    const userConfig = {
      model: { fast: "custom-model" },
      dryRun: false,
    };
    await saveConfig(userConfig);

    const config = await loadConfig();
    expect(config.model.fast).toBe("custom-model");
    expect(config.model.complex).toBe("meta-llama/llama-3.3-70b-instruct:free"); // Default preserved
    expect(config.dryRun).toBe(false);
  });

  it("should merge configs correctly", () => {
    const defaultConfig: AutoPRConfig = {
      model: { fast: "a", complex: "b", fallback: "c", temperature: 0.1 },
      style: { conventionalCommits: true, semanticVersioning: true, includeComplexity: true },
      review: { securityChecklist: true, performanceChecklist: true, styleChecklist: true },
      cache: { enabled: true, directory: ".autopr/cache" },
      api: { rateLimitPerMinute: 10 },
      dryRun: true,
    };

    const userConfig = { dryRun: false, model: { fast: "custom" } };
    const merged = mergeConfig(defaultConfig, userConfig);

    expect(merged.dryRun).toBe(false);
    expect(merged.model.fast).toBe("custom");
    expect(merged.model.complex).toBe("b");
  });

  it("should get correct model for task", () => {
    const config: AutoPRConfig = {
      model: { fast: "fast-model", complex: "complex-model", fallback: "fallback-model", temperature: 0.1 },
      style: { conventionalCommits: true, semanticVersioning: true, includeComplexity: true },
      review: { securityChecklist: true, performanceChecklist: true, styleChecklist: true },
      cache: { enabled: true, directory: ".autopr/cache" },
      api: { rateLimitPerMinute: 10 },
      dryRun: true,
    };

    expect(getModelForTask("fast", config)).toBe("fast-model");
    expect(getModelForTask("complex", config)).toBe("complex-model");
    expect(getModelForTask("fallback", config)).toBe("fallback-model");
  });
});
