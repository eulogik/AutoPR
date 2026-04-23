#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig, getModelForTask, type AutoPRConfig } from "./config.js";
import { getDiff, getCurrentBranch, getCommitHistory, calculateComplexityScore, sanitizeDiff } from "./git.js";
import { OpenRouterClient } from "./openrouter.js";
import { GitHubClient } from "./github.js";
import { Cache } from "./cache.js";
import { readFile } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadPromptTemplate(name: string): Promise<string> {
  const promptPath = resolve(__dirname, "prompts", `${name}.txt`);
  return readFile(promptPath, "utf-8");
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`);
}

async function generatePRDescription(config: AutoPRConfig, baseBranch: string = "main"): Promise<void> {
  const currentBranch = await getCurrentBranch();
  console.log(`Generating PR description for branch: ${currentBranch}`);

  const diff = await getDiff(baseBranch, currentBranch);
  const commits = await getCommitHistory(baseBranch);

  const sanitizedDiff = sanitizeDiff(diff.diff);
  const filesChanged = diff.files.map((f) => `- ${f} (${diff.changeTypes[f]})`).join("\n");
  const changeTypes = Object.entries(diff.changeTypes)
    .map(([file, type]) => `${file}: ${type}`)
    .join(", ");
  const complexityScore = calculateComplexityScore(diff);

  const template = await loadPromptTemplate("describe");
  const prompt = renderTemplate(template, {
    baseBranch,
    currentBranch,
    commitCount: commits.length.toString(),
    filesChanged,
    diffSummary: sanitizedDiff.slice(0, 4000),
    changeTypes,
    complexityScore: complexityScore.toString(),
    conventionalCommits: config.style.conventionalCommits ? "conventional commits" : "standard",
  });

  const cache = config.cache.enabled ? new Cache(config.cache.directory) : undefined;
  const client = new OpenRouterClient(
    config.api.openrouterKey ?? process.env.OPENROUTER_API_KEY ?? "",
    config.api.rateLimitPerMinute,
    cache
  );

  const model = getModelForTask("fast", config);
  console.log(`Using model: ${model}`);

  if (config.dryRun) {
    console.log("\n[DRY RUN MODE] Would send the following to LLM:\n");
    console.log(prompt);
    console.log("\nAdd --no-dry-run to actually generate the description.");
    return;
  }

  const description = await client.withRetry(() =>
    client.chat({
      model,
      messages: [
        { role: "system", content: "You are an expert software engineer writing PR descriptions." },
        { role: "user", content: prompt },
      ],
      temperature: config.model.temperature,
    })
  );

  console.log("\n=== Generated PR Description ===\n");
  console.log(description);
  console.log("\n===============================\n");

  if ((config.api.githubToken && config.api.githubToken !== "") || (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== "")) {
    const shouldCreate = await askConfirmation("Create a PR with this description?");
    if (shouldCreate) {
      const githubClient = new GitHubClient(
        config.api.githubToken && config.api.githubToken !== "" ? config.api.githubToken : process.env.GITHUB_TOKEN ?? "",
        "",
        ""
      );
      // TODO: Implement GitHub PR creation
      console.log("PR creation not yet implemented in this version.");
    }
  }
}

async function reviewPR(prNumber: number, config: AutoPRConfig): Promise<void> {
  console.log(`Reviewing PR #${prNumber}`);

  // Validate git repo
  const { isGitRepo } = await import("./git.js");
  if (!await isGitRepo()) {
    throw new Error("Not a git repository. Please run AutoPR inside a git project.");
  }

  if ((!config.api.githubToken || config.api.githubToken === "") && (!process.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN === "")) {
    throw new Error("GitHub token required for review. Set GITHUB_TOKEN or api.githubToken in config.");
  }

  const githubClient = await GitHubClient.fromGitRemote(
    config.api.githubToken ?? process.env.GITHUB_TOKEN ?? ""
  );

  const prInfo = await githubClient.getPR(prNumber);
  const diff = await githubClient.getPRDiff(prNumber);

  const sanitizedDiff = sanitizeDiff(diff);
  const filesChanged = diff
    .split("\n")
    .filter((l) => l.startsWith("diff --git"))
    .map((l) => `- ${l.replace("diff --git a/", "").split(" b/")[0]}`)
    .join("\n");

  const template = await loadPromptTemplate("review");
  const prompt = renderTemplate(template, {
    prNumber: prNumber.toString(),
    prTitle: prInfo.title,
    filesChanged,
    prDiff: sanitizedDiff.slice(0, 8000),
    securityChecklist: config.review.securityChecklist ? "enabled" : "disabled",
    performanceChecklist: config.review.performanceChecklist ? "enabled" : "disabled",
    styleChecklist: config.review.styleChecklist ? "enabled" : "disabled",
  });

  const cache = config.cache.enabled ? new Cache(config.cache.directory) : undefined;
  const client = new OpenRouterClient(
    config.api.openrouterKey ?? process.env.OPENROUTER_API_KEY ?? "",
    config.api.rateLimitPerMinute,
    cache
  );

  const model = getModelForTask("complex", config);
  console.log(`Using model: ${model}`);

  if (config.dryRun) {
    console.log("\n[DRY RUN MODE] Would send the following to LLM:\n");
    console.log(prompt);
    console.log("\nAdd --no-dry-run to actually post the review.");
    return;
  }

  const reviewContent = await client.withRetry(() =>
    client.chat({
      model,
      messages: [
        { role: "system", content: "You are an expert code reviewer providing inline review comments." },
        { role: "user", content: prompt },
      ],
      temperature: config.model.temperature,
    })
  );

  console.log("\n=== Review Comments ===\n");
  console.log(reviewContent);
  console.log("\n=====================\n");

  if (reviewContent !== "LGTM") {
    const shouldPost = await askConfirmation("Post this review to GitHub?");
    if (shouldPost) {
      const comments = parseReviewComments(reviewContent);
      await githubClient.postReview(prNumber, {
        body: reviewContent,
        comments,
        event: comments.length > 0 ? "REQUEST_CHANGES" : "COMMENT",
      });
      console.log("Review posted successfully.");
    }
  } else {
    console.log("No issues found. LGTM!");
  }
}

function parseReviewComments(reviewText: string): Array<{ path: string; line?: number; body: string }> {
  const comments: Array<{ path: string; line?: number; body: string }> = [];
  const blocks = reviewText.split(/(?=FILE:)/);

  for (const block of blocks) {
    const fileMatch = block.match(/FILE:\s*(.+)/);
    const lineMatch = block.match(/LINE:\s*(\d+|general)/);
    const commentMatch = block.match(/COMMENT:\s*([\s\S]+?)(?=FILE:|$)/);

    if (fileMatch && commentMatch) {
      comments.push({
        path: fileMatch[1].trim(),
        line: lineMatch?.[1] === "general" ? undefined : parseInt(lineMatch?.[1] ?? ""),
        body: commentMatch[1].trim(),
      });
    }
  }

  return comments;
}

async function askConfirmation(message: string): Promise<boolean> {
  const { createInterface } = await import("readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("autopr")
    .description("AutoPR - AI-powered PR description generator and code reviewer")
    .version("1.0.0")
    .option("--no-dry-run", "Actually send API requests (default: dry-run)")
    .hook("preAction", (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts.dryRun !== undefined) {
        process.env.AUTOPR_DRY_RUN = opts.dryRun ? "true" : "false";
      }
    });

  program
    .command("generate")
    .description("Generate a PR description from the current branch diff")
    .option("-b, --base <branch>", "Base branch to compare against", "main")
    .action(async (options) => {
      const config = await loadConfig();
      config.dryRun = process.env.AUTOPR_DRY_RUN === "true";
      await generatePRDescription(config, options.base);
    });

  program
    .command("review <pr_number>")
    .description("Review a PR and post inline comments")
    .action(async (prNumber, options) => {
      const config = await loadConfig();
      config.dryRun = process.env.AUTOPR_DRY_RUN === "true";
      await reviewPR(parseInt(prNumber, 10), config);
    });

  program
    .command("init")
    .description("Initialize AutoPR configuration")
    .action(async () => {
      const config = await loadConfig();
      console.log("Current configuration:");
      console.log(JSON.stringify(config, null, 2));
    });

  await program.parseAsync(argv);
}

// Run main when this is the main module
main(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);

  // Check for common git-related errors
  if (message.includes("Not a git repository") || message.includes("No commits found") || message.includes("Unable to determine current branch")) {
    console.error("❌ Error:", message);
    console.error("\n💡 Quick fix:");
    console.error("  1. Initialize git: git init");
    console.error("  2. Create a commit: git add . && git commit -m 'Initial commit'");
    console.error("  3. Run AutoPR again!");
  } else if (message.includes("Base branch")) {
    console.error("❌ Error:", message);
    console.error("\n💡 Tip: Check available branches with 'git branch -a'");
  } else {
    console.error("❌ Error:", message);
  }

  process.exit(1);
});
