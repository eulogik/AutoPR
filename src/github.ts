import { Octokit } from "@octokit/rest";
import { readFile } from "fs/promises";
import { resolve } from "path";

export interface PRInfo {
  number: number;
  title: string;
  body: string | null;
  state: string;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  user: { login: string };
}

export interface ReviewComment {
  path: string;
  line?: number;
  body: string;
}

export interface Review {
  body: string;
  comments: ReviewComment[];
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
}

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  static async fromGitRemote(token: string): Promise<GitHubClient> {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"]);
    const url = stdout.trim();

    const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
    if (!match) {
      throw new Error("Could not parse GitHub repository from git remote");
    }

    return new GitHubClient(token, match[1], match[2]);
  }

  async getPR(prNumber: number): Promise<PRInfo> {
    const { data } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });

    return {
      number: data.number,
      title: data.title,
      body: data.body,
      state: data.state,
      head: { ref: data.head.ref, sha: data.head.sha },
      base: { ref: data.base.ref, sha: data.base.sha },
      user: { login: data.user?.login ?? "unknown" },
    };
  }

  async getPRDiff(prNumber: number): Promise<string> {
    const { data } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      mediaType: {
        format: "diff",
      },
    });

    return data as unknown as string;
  }

  async createPR(options: {
    title: string;
    body: string;
    base?: string;
    head: string;
  }): Promise<{ number: number; html_url: string }> {
    const { data } = await this.octokit.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title: options.title,
      body: options.body,
      base: options.base ?? "main",
      head: options.head,
    });

    return { number: data.number, html_url: data.html_url };
  }

  async postReview(prNumber: number, review: Review): Promise<void> {
    const comments = review.comments.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
    }));

    await this.octokit.pulls.createReview({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      body: review.body,
      event: review.event,
      comments: comments.length > 0 ? comments : undefined,
    });
  }

  async updatePRDescription(prNumber: number, title: string, body: string): Promise<void> {
    await this.octokit.pulls.update({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      title,
      body,
    });
  }
}
