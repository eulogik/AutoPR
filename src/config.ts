import { readFile, writeFile, access } from "fs/promises";
import { constants } from "fs";
import { resolve, join } from "path";

export interface AutoPRConfig {
  model: {
    fast: string;
    complex: string;
    fallback: string;
    temperature: number;
  };
  style: {
    conventionalCommits: boolean;
    semanticVersioning: boolean;
    includeComplexity: boolean;
  };
  review: {
    securityChecklist: boolean;
    performanceChecklist: boolean;
    styleChecklist: boolean;
  };
  cache: {
    enabled: boolean;
    directory: string;
  };
  api: {
    openrouterKey?: string;
    githubToken?: string;
    rateLimitPerMinute: number;
  };
  dryRun: boolean;
}

const DEFAULT_CONFIG: AutoPRConfig = {
  model: {
    fast: "google/gemma-4-31b-it:free",
    complex: "meta-llama/llama-3.3-70b-instruct:free",
    fallback: "mistralai/mistral-small-3.1-24b-instruct:free",
    temperature: 0.1,
  },
  style: {
    conventionalCommits: true,
    semanticVersioning: true,
    includeComplexity: true,
  },
  review: {
    securityChecklist: true,
    performanceChecklist: true,
    styleChecklist: true,
  },
  cache: {
    enabled: true,
    directory: ".autopr/cache",
  },
  api: {
    rateLimitPerMinute: 10,
  },
  dryRun: true,
};

export type PartialConfig = {
  model?: Partial<AutoPRConfig["model"]>;
  style?: Partial<AutoPRConfig["style"]>;
  review?: Partial<AutoPRConfig["review"]>;
  cache?: Partial<AutoPRConfig["cache"]>;
  api?: Partial<AutoPRConfig["api"]>;
  dryRun?: boolean;
};

export async function loadConfig(cwd: string = process.cwd()): Promise<AutoPRConfig> {
  const configPaths = [
    resolve(cwd, ".autopr.json"),
    resolve(cwd, ".autoprrc.json"),
    resolve(cwd, ".autoprrc"),
  ];

  let userConfig: PartialConfig = {};

  for (const configPath of configPaths) {
    try {
      await access(configPath, constants.F_OK);
      const content = await readFile(configPath, "utf-8");
      userConfig = JSON.parse(content) as PartialConfig;
      break;
    } catch {
      continue;
    }
  }

  return mergeConfig(DEFAULT_CONFIG, userConfig);
}

export function mergeConfig(defaultConfig: AutoPRConfig, userConfig: PartialConfig): AutoPRConfig {
  return {
    model: { ...defaultConfig.model, ...userConfig.model },
    style: { ...defaultConfig.style, ...userConfig.style },
    review: { ...defaultConfig.review, ...userConfig.review },
    cache: { ...defaultConfig.cache, ...userConfig.cache },
    api: { ...defaultConfig.api, ...userConfig.api },
    dryRun: userConfig.dryRun ?? defaultConfig.dryRun,
  };
}

export async function saveConfig(config: PartialConfig, cwd: string = process.cwd()): Promise<void> {
  const configPath = resolve(cwd, ".autopr.json");
  const existing = await loadConfig(cwd);
  const merged = mergeConfig(existing, config);
  await writeFile(configPath, JSON.stringify(merged, null, 2), "utf-8");
}

export function getModelForTask(task: "fast" | "complex" | "fallback", config: AutoPRConfig): string {
  switch (task) {
    case "fast":
      return config.model.fast;
    case "complex":
      return config.model.complex;
    case "fallback":
      return config.model.fallback;
  }
}
