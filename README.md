<div align="center">

<img src="assets/banner.png" alt="Kova Agent" width="720"/>

</div>

> **The self-improving AI agent — your bots, your cloud, your rules.**
> Kova creates skills from experience, remembers who you are, runs scheduled
> routines, and drives a real terminal and browser. One agent core, every
> surface: CLI, desktop app, Telegram, Discord, Slack, WhatsApp, and more.

[![License: MIT](https://img.shields.io/badge/License-MIT-7c5cff.svg)](LICENSE)
![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-22d3ee.svg)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-9aa3b2.svg)

```bash
curl -fsSL https://kova.neuralstudio.in/install.sh | bash   # macOS / Linux
irm https://kova.neuralstudio.in/install.ps1 | iex          # Windows
```

## Why Kova

- **Learns your workflows** — saves reusable procedures as *skills* it reloads
  in future sessions, improving them as it uses them.
- **A team, not a chatbot** — spawn specialist bots with their own persona,
  memory, and model. They message each other; you get the summary.
- **Works while you're away** — routines (cron) run on a $5 VPS or your own
  server, even when your machine is off.
- **Any model, any provider** — OpenRouter, Anthropic, OpenAI, Google,
  Nous Portal, local models, 20+ more. Swap mid-workflow. Bring your own
  keys, always.
- **Everywhere you are** — the same agent answers from your terminal, desktop
  app, and every messaging platform you already use.

## Quick taste

```bash
kova                 # interactive chat
kova setup           # wizard: pick model + provider
kova doctor          # health check
```

Give a bot a job from your phone:

> @researcher "summarize the top 3 HN threads about e-bikes, post to #lab"

…wake up to the digest your routine compiled at 6am.

## Bots & Routines (the good part)

Each bot is an isolated profile — its own config, memory, skills, credentials:

```bash
kova -p researcher chat          # talk to one specialist
kova cron list                   # see everyone's routines
```

Group chats let up to six bots deliberate; @mentions hand off work across
machines — including between your laptop and your Kova Cloud instance.

## Documentation

Full docs at [kova.neuralstudio.in/docs](https://kova.neuralstudio.in/docs)
*(placeholder — ships with the docs layer)*.

## Credits & license

Kova Agent is an independent product by **Neural Studio**
([neuralstudio.in](https://neuralstudio.in)), built on the excellent
MIT-licensed [Hermes Agent](https://github.com/NousResearch/hermes-agent)
by Nous Research — see [HONORS.md](HONORS.md).

MIT — see [LICENSE](LICENSE). The Kova name and logo are trademarks of
Neural Studio; this project is an independent product.
