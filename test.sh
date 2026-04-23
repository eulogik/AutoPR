#!/bin/bash
# Quick test script for AutoPR

echo "=== AutoPR Test ==="
echo ""
echo "1. Testing CLI help:"
node dist/cli.js --help

echo ""
echo "2. Testing generate command (dry-run by default):"
echo "   (This would show what would be sent to the LLM)"
echo ""

echo "3. To use AutoPR:"
echo "   a) Set your OpenRouter API key:"
echo "      export OPENROUTER_API_KEY='sk-or-v1-your-key'"
echo ""
echo "   b) In any git repo, run:"
echo "      autopr generate --no-dry-run"
echo ""
echo "   c) To review a PR:"
echo "      autopr review 123 --no-dry-run"
echo ""
echo "4. Install globally:"
echo "   npm install -g ."
echo "   (Then you can run 'autopr' from anywhere)"
