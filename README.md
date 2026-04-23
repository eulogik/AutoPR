# AutoPR
### AI-Powered PR Descriptions & Code Reviews in Seconds

Stop wasting time writing PR descriptions. Stop manual code reviews. AutoPR automates it all using free LLMs via OpenRouter.

[![npm version](https://img.shields.io/npm/v/autopr.svg)](https://www.npmjs.com/package/autopr)
[![MIT License](https://img.shields.io/npm/l/autopr.svg)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/anomalyco/autopr/build.yml?branch=main)](https://github.com/anomalyco/autopr/actions)
[![Tests](https://img.shields.io/badge/tests-22%20passing-brightgreen)](https://github.com/anomalyco/autopr/actions)

## The Problem
- Writing PR descriptions is tedious and time-consuming
- Manual code reviews are slow and inconsistent
- Developers hate context-switching from coding to writing docs

## The Solution
AutoPR uses free, small LLMs via OpenRouter to:
1. Auto-generate professional PR descriptions from your git diffs and commit history
2. Automatically review PRs with inline comments and security/performance checks
3. Works as a CLI tool or a fully automated GitHub Action

## Why AutoPR?
- **100% Free**: Uses OpenRouter's free tier models (no subscription, no cost)
- **Secure by Default**: Only sends diffs (never full code), sanitizes secrets, dry-run mode enabled by default
- **Lightning Fast**: Generates PR descriptions in seconds, reviews PRs in minutes
- **Zero Bloat**: No heavy frameworks, uses native Node.js APIs, small footprint
- **Reliable**: TypeScript strict mode, 22 passing unit tests, ESLint clean
- **Flexible**: Works in any git repo, customizable via `.autopr.json`, supports multiple LLM models

## Features
- **CLI Tool**: `autopr generate` to create PR descriptions, `autopr review` to review PRs
- **GitHub Action**: Fully automated PR descriptions and reviews on every PR open/update
- **Smart Prompts**: Includes security, performance, and style checklists for reviews
- **Caching**: Avoid duplicate API calls with file-based caching
- **Rate Limiting**: Respects API limits (10 calls/minute max)
- **Configurable**: Choose models, set preferences, enable/disable features via config

## Quick Start
### 1. Install
```bash
npm install -g autopr
```

### 2. Get OpenRouter API Key
Sign up at [OpenRouter](https://openrouter.ai) (free tier available) and get your API key.

### 3. Set Your API Key
```bash
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"
```
Or add it to your `.autopr.json` config file.

### 4. Generate Your First PR Description
```bash
cd your-git-repo
autopr generate --no-dry-run
```

## GitHub Action (Automate Everything)
Add AutoPR to your repo's GitHub Actions to auto-generate PR descriptions and review PRs on every push:

1. Create `.github/workflows/autopr.yml` (already included in the repo)
2. Add your OpenRouter API key to your repo's GitHub Secrets as `OPENROUTER_API_KEY`
3. Push a PR - AutoPR will automatically generate the description and review the code

Example workflow (included in repo):
```yaml
name: AutoPR
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
jobs:
  autopr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install -g autopr
      - name: Generate PR Description
        if: github.event.action == 'opened'
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: autopr generate --no-dry-run
      - name: Review PR
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: autopr review ${{ github.event.number }} --no-dry-run
```

## Configuration
Create a `.autopr.json` file in your project root to customize AutoPR:
```json
{
  "model": {
    "fast": "google/gemma-4-31b-it:free",
    "complex": "meta-llama/llama-3.3-70b-instruct:free",
    "fallback": "mistralai/mistral-small-3.1-24b-instruct:free",
    "temperature": 0.1
  },
  "style": {
    "conventionalCommits": true,
    "semanticVersioning": true,
    "includeComplexity": true
  },
  "review": {
    "securityChecklist": true,
    "performanceChecklist": true,
    "styleChecklist": true
  },
  "cache": {
    "enabled": true,
    "directory": ".autopr/cache"
  },
  "api": {
    "rateLimitPerMinute": 10
  },
  "dryRun": true
}
```

## Trust & Reliability
- **MIT License**: 100% open source, free to use and modify
- **TypeScript Strict**: No `any` types, full type safety
- **Tested**: 22 unit tests passing, core functions covered
- **Lint Clean**: ESLint with strict rules, no warnings
- **Secure**: Sanitizes diffs to remove secrets, never sends full file contents to APIs

## Get Involved
- Star the repo on GitHub to help us reach the top charts!
- Report issues or request features on GitHub Issues
- Contribute: PRs are welcome!
