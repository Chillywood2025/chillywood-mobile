# BrowserStack MCP Setup For Codex/Cursor/VS Code

Date: June 18, 2026

## Current Repo Check

BrowserStack MCP is not currently configured for this Codex session.

Local check performed:

- `~/.codex/config.toml` contains `expo-mcp` and `node_repl`.
- No `browserstack`, `@browserstack/mcp-server`, or BrowserStack MCP server entry was found in the local Codex MCP config.
- This repo was not changed to add credentials to any MCP config.

Do not modify `~/.codex/config.toml` without explicit user approval.

## What BrowserStack MCP Does

BrowserStack MCP connects an AI-enabled client to BrowserStack tools/results through a local MCP server. It can help inspect BrowserStack state, fetch or analyze test results/logs, and propose code fixes from that context.

Codex may propose fixes from BrowserStack evidence, but it must not auto-merge to `main`, auto-commit secrets, or bypass repo validation.

Credentials must stay local. Prefer environment variables over plain text in config files.

## Official Setup References

Official BrowserStack docs describe the local MCP server as a local gateway for AI clients such as VS Code/Copilot, Cline, Cursor, and Claude. The official package name shown in BrowserStack docs and the public GitHub package metadata is:

```text
@browserstack/mcp-server
```

The package requires Node `>=18`.

References:

- BrowserStack local MCP docs: `https://www.browserstack.com/docs/browserstack-mcp-server/get-started/local-mcp`
- Official GitHub repo: `https://github.com/browserstack/mcp-server`

## Safe Setup Pattern

Use local environment variables:

```sh
export BROWSERSTACK_USERNAME="..."
export BROWSERSTACK_ACCESS_KEY="..."
```

Do not commit those values. Do not paste them into repo docs, app code, screenshots, logs, or proof summaries.

For VS Code/Cursor, follow BrowserStack's official one-click or manual setup flow and choose environment-variable based credentials when available. If a client requires JSON config, keep it in the user-level client config, not in this repo.

## Codex Use

If BrowserStack MCP is later configured for Codex, the safe workflow is:

1. Run BrowserStack tests only after explicit approval for the specific suite.
2. Ask Codex to fetch build/session status or logs through the MCP tool.
3. Save sanitized build/session ids and links in `/tmp` proof folders.
4. Use BrowserStack evidence to propose or implement scoped fixes.
5. Run repo validation before any commit.

Codex must not:

- print access keys
- write credentials into code
- auto-merge to `main`
- weaken Premium, RLS, LiveKit, Watch-Party, Chi'lly Chat, money, or payout controls to make a test pass
- fake purchase completion or mark manual-assisted Google Play purchase flows passed unless they actually ran
