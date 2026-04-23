import { execFile } from "child_process";
import { promisify } from "util";
import { resolve } from "path";

const execFileAsync = promisify(execFile);

export async function isGitRepo(): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

export async function hasCommits(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", "HEAD"]);
    return stdout.trim() !== "";
  } catch {
    return false;
  }
}

export interface GitDiff {
  files: string[];
  diff: string;
  changeTypes: Record<string, "add" | "modify" | "delete">;
  insertions: number;
  deletions: number;
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export async function getDiff(baseBranch: string = "main", currentBranch?: string): Promise<GitDiff> {
  // Validate git state
  if (!await isGitRepo()) {
    throw new Error("Not a git repository. Please run AutoPR inside a git project.");
  }

  const branch = currentBranch && currentBranch !== "" ? currentBranch : await getCurrentBranch();

  // Check if base branch exists
  try {
    await execFileAsync("git", ["rev-parse", "--verify", baseBranch]);
  } catch {
    throw new Error(`Base branch '${baseBranch}' not found. Try: autopr generate --base <your-base-branch>`);
  }

  const { stdout: diffOutput } = await execFileAsync("git", [
    "diff",
    "--unified=3",
    `${baseBranch}...${currentBranch}`,
  ]);

  const { stdout: nameStatus } = await execFileAsync("git", [
    "diff",
    "--name-status",
    `${baseBranch}...${currentBranch}`,
  ]);

  const { stdout: statOutput } = await execFileAsync("git", [
    "diff",
    "--stat",
    `${baseBranch}...${currentBranch}`,
  ]);

  const files: string[] = [];
  const changeTypes: Record<string, "add" | "modify" | "delete"> = {};

  for (const line of nameStatus.split("\n").filter(Boolean)) {
    const [status, ...fileParts] = line.split("\t");
    const file = fileParts.join("\t");
    files.push(file);

    if (status === "A") changeTypes[file] = "add";
    else if (status === "D") changeTypes[file] = "delete";
    else changeTypes[file] = "modify";
  }

  let insertions = 0;
  let deletions = 0;

  for (const line of statOutput.split("\n").filter(Boolean)) {
    const match = line.match(/(\d+) insertion[s]?\(\+\)/);
    if (match) insertions = parseInt(match[1], 10);

    const delMatch = line.match(/(\d+) deletion[s]?\(-\)/);
    if (delMatch) deletions = parseInt(delMatch[1], 10);
  }

  return {
    files,
    diff: diffOutput,
    changeTypes,
    insertions,
    deletions,
  };
}

export async function getCurrentBranch(): Promise<string> {
  const isRepo = await isGitRepo();
  if (!isRepo) {
    throw new Error("Not a git repository. Please run AutoPR inside a git project.");
  }

  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = stdout.trim();

    if (!branch || branch === "HEAD") {
      throw new Error("No commits found. Please create at least one commit before running AutoPR.");
    }

    return branch;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not a git")) {
      throw error;
    }
    throw new Error("Unable to determine current branch. Ensure you have commits in your repository.");
  }
}

export async function getCommitHistory(baseBranch: string = "main", count: number = 10): Promise<CommitInfo[]> {
  const { stdout } = await execFileAsync("git", [
    "log",
    `${baseBranch}..HEAD`,
    `--pretty=format:%H|%s|%an|%ai`,
    `-n`,
    count.toString(),
  ]);

  if (!stdout.trim()) return [];

  return stdout.split("\n").map((line) => {
    const [hash, message, author, date] = line.split("|");
    return { hash, message, author, date };
  });
}

export async function getRemoteUrl(): Promise<string> {
  const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"]);
  return stdout.trim();
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const patterns = [
    /github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/,
    /github\.com\/([^/]+)\/([^/]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
    }
  }

  return null;
}

export function calculateComplexityScore(diff: GitDiff): number {
  const { files, insertions, deletions } = diff;
  let score = 0;

  // File count factor
  score += Math.min(files.length * 0.5, 3);

  // Line change factor
  const totalChanges = insertions + deletions;
  score += Math.min(totalChanges / 100, 4);

  // File type diversity
  const extensions = new Set(files.map((f) => f.split(".").pop()));
  score += Math.min(extensions.size * 0.3, 2);

  // Large file penalty
  if (files.some((f) => f.includes("test") || f.includes("spec"))) {
    score = Math.max(0, score - 1);
  }

  return Math.min(Math.round(score * 10) / 10, 10);
}

export function sanitizeDiff(diff: string): string {
  const secretPatterns = [
    /(API_KEY|SECRET|TOKEN|PASSWORD|PASS|AUTH)[=:"'\s]+[^\s"']+/gi,
    /(sk-[a-zA-Z0-9]{32,})/g,
    /(ghp_[a-zA-Z0-9]{36,})/g,
    /\.env/g,
  ];

  let sanitized = diff;
  for (const pattern of secretPatterns) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  return sanitized;
}
