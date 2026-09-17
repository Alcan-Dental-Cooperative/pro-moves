#!/usr/bin/env bash
# Guard hook for Claude Code — PreToolUse
#
# Blocks:
#   1. git push to main / origin main
#   2. Any --force or --force-with-lease push
#   3. Edits/writes to CLAUDE.md
#   4. Any read of or write to a .env file, from Bash or from Edit/Write
#
# Why 4 lives here and not in settings.json: permission rules are per-tool, so
# a `Read(./.env)` deny places no constraint on the Bash tool, and Bash matching
# is prefix-based, so there is no way to express "any command that mentions
# .env" -- `cat .env`, `cat ./.env` and `cat  .env` are three different
# prefixes. A PreToolUse hook sees the whole command string and can match it.
#
# What 4 does NOT do: it matches the command string, so a deliberately obfuscated
# read (`cat $(printf '.e%s' nv)`) still gets through. It closes the ordinary
# spellings, not an adversary. Real isolation would need a sandbox.
#
# Adapted from autoDev's guard-push.sh / guard-docs.sh
# (github.com/eschnei/autodev, Apache-2.0) with attribution.

set -euo pipefail

# The hook receives JSON on stdin with tool_name and tool_input.
INPUT="$(cat)"

TOOL_NAME="$(echo "$INPUT" | jq -r '.tool_name // empty')"

# --- Guard Bash commands ---
if [ "$TOOL_NAME" = "Bash" ]; then
  COMMAND="$(echo "$INPUT" | jq -r '.tool_input.command // empty')"

  # Block push to main
  if echo "$COMMAND" | grep -qE 'git\s+push\s.*(main|origin\s+main|origin\/main)'; then
    echo "Blocked: pushing to main is not allowed. Use a branch and open a PR instead." >&2
    exit 2
  fi

  # Block force push
  if echo "$COMMAND" | grep -qE 'git\s+push\s.*--force'; then
    echo "Blocked: force-pushing is not allowed. It rewrites history and can destroy work." >&2
    exit 2
  fi

  # Block any read of a .env file. `Read(./.env*)` in settings.json only binds
  # the Read tool; cat/head/tail/sed/awk/grep/rg/jq are all allow-listed and
  # each re-opens the file the Read deny appears to close.
  # Example spellings are scrubbed first so they stay usable.
  SCRUBBED="$(echo "$COMMAND" | sed -E 's/\.env\.(example|sample|template|dist)([^A-Za-z0-9_-]|$)/\2/g')"
  if echo "$SCRUBBED" | grep -qE '(^|[^A-Za-z0-9_])\.env([^A-Za-z0-9_-]|$)'; then
    echo "Blocked: .env files hold credentials and must not be read or written by AI sessions. Ask John if you need a value from it." >&2
    exit 2
  fi
fi

# --- Guard edits/writes to CLAUDE.md ---
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
  FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')"
  if echo "$FILE_PATH" | grep -qE '(^|/)CLAUDE\.md$'; then
    echo "Blocked: CLAUDE.md is project policy and must not be edited by AI sessions. Ask John to update it manually." >&2
    exit 2
  fi
  if echo "$FILE_PATH" | grep -qE '(^|/)\.env([^A-Za-z0-9_-]|$)' \
     && ! echo "$FILE_PATH" | grep -qE '(^|/)\.env\.(example|sample|template|dist)$'; then
    echo "Blocked: .env files hold credentials and must not be read or written by AI sessions. Ask John if you need a value from it." >&2
    exit 2
  fi
fi

# Allow everything else: exit 0 with no output. (Printing JSON here is what
# caused the "Hook JSON output validation failed" spam — "allow" is not a
# valid decision value, and the pass-through case needs no output at all.)
exit 0
