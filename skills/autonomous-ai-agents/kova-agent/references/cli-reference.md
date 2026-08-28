# Kova CLI Reference

Live sources when anything looks stale: `kova --help`, `kova <command> --help`,
https://kova-agent.nousresearch.com/docs/reference/cli-commands

### Global Flags

```
kova [flags] [command]        (no subcommand = interactive chat)

  --version, -V             Show version
  -z, --oneshot PROMPT      One-shot: print ONLY the final response (for scripts/pipes)
  -m MODEL  --provider P    Model/provider override for this invocation
  -t, --toolsets LIST       Comma-separated toolsets for this invocation
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --tui / --cli             Force the Ink TUI / classic REPL
  --ignore-rules            Skip AGENTS.md/SOUL.md/memory/skill injection
  --safe-mode               Disable ALL customizations (troubleshooting)
  --pass-session-id         Include session ID in system prompt
```

### Chat

```
kova chat [flags]
  -q, --query TEXT          Single query, non-interactive
  --image PATH              Attach a local image to a single query
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --max-turns N             Cap tool-calling iterations
  --source TAG              Session source tag (default: cli)
```
(plus the global flags above)

### Configuration

```
kova setup [section]      Wizard (model|tts|terminal|gateway|tools|agent)
kova model                Interactive model/provider picker
kova fallback [add|remove|list]  Fallback provider chain
kova config [show|edit|get|set|unset|path|env-path|check|migrate]
kova login / logout       OAuth sign-in / clear stored auth
kova doctor [--fix]       Check dependencies and config
kova status [--all]       Component status
```

### Tools & Skills

```
kova tools [list|enable NAME|disable NAME]   Per-platform toolsets (curses UI with no args)

kova skills list|browse|search QUERY|inspect ID
kova skills install ID    Hub identifier OR a direct https://…/SKILL.md URL
kova skills config        Enable/disable skills per platform
kova skills check|update|uninstall|publish PATH
kova skills tap add REPO  Add a GitHub repo as a skill source
kova bundles              Skill bundles (one /<name> alias loads several skills)
```

### MCP Servers

```
kova mcp add NAME (--url or --command) | remove | list | test NAME
kova mcp catalog | install NAME     Curated catalog install
kova mcp configure NAME             Toggle tool selection
kova mcp serve                      Run Kova as an MCP server
```
Details (transport, tool discovery, catalog): `references/native-mcp.md`.

### Gateway (Messaging Platforms)

```
kova gateway run|install|start|stop|restart|status|setup
```

20+ platforms: Telegram, Discord, Slack, WhatsApp (Baileys + Business Cloud API), iMessage (Photon — `kova photon setup`), Signal, Email, SMS, Matrix, Mattermost, Teams, LINE, SimpleX, ntfy, Google Chat, Home Assistant, DingTalk, Feishu, WeCom, Weixin, API Server, Webhooks. Open WebUI connects via the API Server adapter. Most adapters ship under `plugins/platforms/`.
Docs: https://kova-agent.nousresearch.com/docs/user-guide/messaging/

### Sessions

```
kova sessions list|browse|rename ID TITLE|delete ID|export OUT|prune|stats
```

### Cron / Webhooks

```
kova cron list|create SCHED|edit ID|pause|resume|run ID|remove|status
    Schedules: '30m', 'every 2h', '0 9 * * *', ISO timestamp
kova webhook subscribe NAME|list|remove NAME|test NAME
```
Webhook payloads/routes: `references/webhooks.md`.

### Profiles

```
kova profile list|create NAME (--clone|--clone-all|--clone-from)|use|show|delete
kova profile rename A B | alias NAME | export NAME | import FILE
```

### Credentials & Pools

```
kova auth                 Interactive credential manager
kova auth add [PROVIDER]  Add OAuth or API-key credential (nous, openai-codex, qwen-oauth, …)
kova auth list|remove P IDX|reset PROVIDER|status
```
Multiple credentials per provider form a pool that rotates automatically and skips exhausted keys.

### Other

```
kova desktop / gui        Native desktop app
kova dashboard            Web admin panel + embedded chat (--stop / --status)
kova proxy                OpenAI-compatible local proxy backed by an OAuth provider
kova portal               Quick setup / sign in via Nous Portal
kova kanban <verb>        Multi-agent work-queue board
kova project              Named multi-folder workspaces
kova skin list|use|set    Switch/tweak skins (see references/themes.md)
kova pets <verb>          Pet mascots (see references/petdex.md)
kova memory setup|status|off|reset   Memory provider
kova secrets bitwarden|onepassword   External secret stores
kova moa                  Mixture-of-Agents slots
kova hooks / security / backup / import / checkpoints / console
kova logs [-f] [errors]   View agent/error logs
kova send                 One-off message through a gateway platform
kova pairing / plugins / insights / journey / computer-use
kova acp                  ACP server (IDE integration)
kova completion bash|zsh|fish
kova update / uninstall / claw migrate
```

Plugin- and provider-supplied subcommands (e.g. `kova photon setup`) only appear once their plugin is installed/active.

### Where to Find Things

| Looking for... | Location |
|---|---|
| Config options | `kova config edit` · [Configuration docs](https://kova-agent.nousresearch.com/docs/user-guide/configuration) |
| Tools / toolsets | `kova tools list` · [Tools reference](https://kova-agent.nousresearch.com/docs/reference/tools-reference) |
| Skills catalog | `kova skills browse` · [Skills catalog](https://kova-agent.nousresearch.com/docs/reference/skills-catalog) |
| Provider setup | `kova model` · [Providers guide](https://kova-agent.nousresearch.com/docs/integrations/providers) |
| Env variables | `kova config env-path` · [Env vars reference](https://kova-agent.nousresearch.com/docs/reference/environment-variables) |
| Gateway logs | `~/.kova/logs/gateway.log` (or `kova logs`) |
| Sessions | `kova sessions browse` (reads state.db) |
