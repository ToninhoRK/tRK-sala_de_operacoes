# Sala de Operações

🇧🇷 [Português](README.md) · 🇺🇸 **English**

**Watch your AI agents at work.** Sala de Operações ("Operations Room") turns agents, scheduled jobs and your team's ticket queue into a living office where every agent is an employee with a desk of their own. Whoever is running sits down and types. Whoever failed stands up and asks for help. One look tells you how the operation is doing, with no logs and no terminal. It works with **Hermes** and with **Claude Code**.

![Sala de Operações: isometric floor plan with rooms, desks and one employee per agent](docs/en/sala-de-operacoes.png)

<sub>All screenshots use demo mode, with fictitious agents and numbers. The interface speaks English and Brazilian Portuguese and follows your browser's language; room and agent names come from your own configuration.</sub>

## Contents

- [Six ways to see the same operation](#six-ways-to-see-the-same-operation)
  - [Floor plan](#floor-plan-the-day-to-day) · [TV mode](#tv-mode-for-the-wall-of-the-room) · [3D](#3d-the-same-room-with-depth) · [Pixel art](#pixel-art-the-same-room-game-style) · [List](#list-everything-in-one-table) · [Jobs](#jobs-the-schedule-and-history-of-your-routines)
- [What you see at a glance](#what-you-see-at-a-glance)
- [Highlights](#highlights)
- [Requirements](#requirements)
- [Up and running in a minute](#up-and-running-in-a-minute)
- [With Claude Code](#with-claude-code)
- [Make it yours](#make-it-yours)
- [Privacy and security](#privacy-and-security)
- [Quality](#quality)
- [Built with](#built-with)
- [License](#license)

---

## Six ways to see the same operation

### Floor plan: the day-to-day
The full view for whoever follows things closely. Each room groups one kind of agent, and each desk shows the agent's name and state. Alongside you get the run history, the model used and the next scheduled run. Click a desk to see the details.

### TV mode: for the wall of the room
Made to be read from across the room. The indicators get big, the side panel goes away and the **NOW** column shows only what matters right now: what failed, what is stuck and what is running. When everything is fine, it says so too.

![TV mode: large indicators and the NOW column with failures and runs in progress](docs/en/sala-tv.png)

### 3D: the same room, with depth
The same floor plan, now in real 3D, with volume, light and shadow. The angle, the furniture, the people and the labels stay in the same place, so the room is still yours.

![3D theme: the same floor plan with volume, light and shadow](docs/en/sala-3d.png)

### Pixel art: the same room, game style
The same floor plan redrawn in pixels, with an outline around every piece of furniture and hand-drawn employees wearing the same clothes and making the same gestures. Names and states stay sharp on top. Zoom into a room (mouse wheel or click its sign) to see every pixel. There is a TV version too.

![Pixel art theme: the same floor plan drawn in pixels](docs/en/sala-pixel.png)

### List: everything in one table
The **OFFICE | LIST** switch swaps the floor plan for a table with every station: state, room, owner, last run, runs in the period, success rate and usage. Click a column title to sort, and use **EXPORT CSV** to take the numbers to a spreadsheet. A station under maintenance shows in lilac and raises no alarm.

![List mode: table with owner, success rate, one station failing and another under maintenance](docs/en/sala-lista.png)

### Jobs: the schedule and history of your routines
The third option of the switch, **JOBS**, puts only the scheduled routines on one page. At the top are the indicators for the period: runs, success rate, failures, average duration and the next run, with a countdown. Below them, the runs coming up in the next 7 days, worked out from each routine's schedule and spelled out in plain words ("weekdays, every hour, 08:00 to 18:00"). Then the history as a grid, one square per day: green, red, lilac for maintenance. Last, a sortable table per routine with **EXPORT CSV**.

![JOBS view: job indicators, the coming week's runs, history grid and per-routine table](docs/en/sala-jobs.png)

---

## What you see at a glance

| In the room | Means |
|---|---|
| Employee sitting and typing, cyan badge | the agent is running right now |
| Employee walking around, green badge | the last run finished fine |
| Employee standing with a **!**, red badge | the last run failed |
| Speech bubble with a **?**, in amber | the agent is running, but has taken no action for 5 minutes |
| Amber clock, "LATE BY…" | a job should have run and didn't |
| Blinking rack in the scheduler room | a scheduled job is running, with its next run alongside |

At the top, a verdict answers first: **NORMAL**, **ATTENTION** or **FAILURE**. Next to it you get today's numbers, the trend and success rate for the period (7 to 90 days), the latest activity and, if you want, your Claude plan usage.

## Highlights

- **Work passed from hand to hand:** stations in a chain are connected by lines that light up when the source runs. When an agent in the chain starts running, the employee from the previous step walks a folder over to their desk: you can watch data being handed over between rooms.
- **What it is doing right now:** click an agent's employee and a panel on the right shows, live, the full model reasoning, replies and commands, and the start of each result. The room keeps running behind it. Prefer less? In SETTINGS, "Agent activity: Summary" shows only the time and the name of each tool.
- **The brain has a desk too:** the main Hermes agent is Jarvis, a robot in the boardroom (DIRETORIA), which shows **TALKING TO YOU** while you are talking to it.
- **Panels on the wall:** the note count of your Obsidian vault (how many arrived today and this week, and the audit result) and your team queue totals hang on the room walls, like in a real office.
- **A late job doesn't go unnoticed:** if a scheduled job didn't fire on time (or an agent went past its agreed interval without running), its station turns amber and the alarm goes off. Green only when it is really up to date.
- **Sound alerts:** a short sound when something fails, hangs or runs late, and a softer one when it is back to normal. The room keeps watching even with the tab in the background.
- **Activity without the noise:** repeated runs collapse into a single line ("×6 · since 09:00"), only what broke the pattern is highlighted, and one click shows **exceptions only**.
- **Trend, success and usage:** runs and failures over 7, 15, 30, 60 or 90 days (you pick in SETTINGS) at the top and on every station, with the success rate (successful runs ÷ runs), each run's duration and tokens and estimated cost per agent. The room keeps its own history of scheduled jobs, so long periods work for them too.
- **E-mail alerts (optional):** the room's watcher, a lightweight script with no AI, checks the operation every 5 minutes and e-mails a single address when something fails, hangs, runs late or a data source has a problem, and again when it is back to normal. At most one problem alert per station every 30 minutes, so a flaky job doesn't flood your inbox. Only names, states and times. If the watcher itself stops, the room tells you. Every Monday at 8 a.m. you also get a weekly summary: success rate, failures per station, what is late or under maintenance, and usage per agent.
- **Maintenance without false alarms:** opened a maintenance window for a station? It turns lilac with **MAINTENANCE** until the set date, triggers no sound or e-mail, and runs inside the window stay out of the success rate.
- **Every station has an owner:** the person responsible shows up in the details, the list and the export.
- **Nothing vanishes silently:** a run that died halfway, without reaching the end, shows up as **INTERRUPTED**. And if a job's script or an agent's prompt disappears from disk, the room warns you before the next run fails.
- **Office or list:** the OFFICE | LIST | JOBS switch at the top toggles between the floor plan and the same stations in a table you can sort by state, room, owner, last run, success or usage (the active view stays lit), and the **EXPORT CSV** button takes the table to Excel. Handy on a phone and for finding a station fast. SOUND and CENTER live at the top too, with the other controls.
- **Smoothness on display:** the Operation card shows the animation's frames per second, updated every second (normal is your screen's refresh rate: 60 on a regular monitor). A number well below that means the page is too heavy for that machine.
- **English or Portuguese:** the whole interface follows the browser's language: Portuguese browsers get Portuguese, everything else gets English (dates as mm/dd, CSV with commas). Add `?lang=en` or `?lang=pt` to the address to force one. Room and agent names are yours and stay as you wrote them.
- **Keyboard friendly:** Tab moves through the stations, Enter opens the details and Esc closes them. Stations have descriptions for screen readers.
- **Your way:** in the **SETTINGS** menu you choose the theme, how much animation you want, which labels show up, and whether stations display friendly names ("Consulta AD") or the technical id.
- **The team in the same place (optional):** open, unassigned, overdue and closed tickets in Agidesk, plus the week's resolution time, always as team totals. Nobody becomes an individual scoreboard.
- **Organizes itself:** a new agent gets a desk automatically, and rooms grow as the operation grows.
- **Lightweight:** a pure Python server and a page in the browser. No database, no build step, no dependencies to install.
- **Any screen:** from an ultrawide monitor to a laptop (the side panel collapses with one click) and a phone.

## Requirements

| To | You need |
|---|---|
| Run the room | **Python 3.9 or newer** (tested on 3.9 and 3.14; standard library only, nothing to pip install) |
| View the room | a current browser. Tested on **Google Chrome**; Edge uses the same engine. The 3D theme needs WebGL, which current browsers ship enabled |
| Real data | **[Hermes](https://hermes-agent.nousresearch.com/docs)** or **[Claude Code](https://code.claude.com/docs)** on the same machine (or any command, [through the wrapper](#with-claude-code)). Without either, the room opens with example agents |
| Claude usage at the top (optional) | **Claude Code** signed in with a subscription (Pro or Max) |
| Team queue (optional) | an **Agidesk** account with an API key, stored in the macOS Keychain |
| E-mail alerts (optional) | **[himalaya](https://github.com/pimalaya/himalaya)** with a sending account set up |
| Run the tests | **Google Chrome** (the test opens the page in a hidden Chrome) |

Tested on macOS. The server is pure Python and should also run on Linux and Windows, but the optional integrations (Keychain) are macOS only.

## Up and running in a minute

```bash
git clone https://github.com/ToninhoRK/tRK-sala_de_operacoes.git
cd tRK-sala_de_operacoes
python3 server.py
```

Open **http://127.0.0.1:8765** in your browser. To see every state in action, use **http://127.0.0.1:8765/?demo=1**.

With [Hermes](https://hermes-agent.nousresearch.com/docs) installed, its agents and scheduled jobs show up on their own. Without it, the room opens with the example agents in the `exemplo/` folder.

To keep the room always on on a Mac, with the watcher every 5 minutes, run `python3 agendar_mac.py`: it creates and starts both launchd jobs with the right paths (`--simular` previews them, `--remover` undoes it).

## With Claude Code

The room also follows **Claude Code** agents running headless (`claude -p`), started by hand or by any scheduler (cron, launchd, Windows Task Scheduler). `registrar_execucao.py` runs the command and records its start, end and result. The answer shows up in your terminal and is never stored.

1. Add the agent to the catalog `~/.hermes/scripts/agentes.json` (the folder name comes from Hermes, but Hermes does not need to be installed):

```json
{"resumo_diario": {"descricao": "Resume os chamados abertos do dia", "modelo": "claude-sonnet", "cadencia_h": 24}}
```

2. Run the agent through the wrapper. A name missing from the catalog is refused (exit code 2) before anything runs, so a typo never turns into runs the room never shows:

```bash
python3 registrar_execucao.py resumo_diario --modelo claude-sonnet -- claude -p "Summarize today's open tickets"
```

3. Optional, to see your plan usage at the top: in `~/.claude/settings.json`, point Claude Code's status line to the room's `claude_statusline.py`. It starts showing your 5-hour session and weekly usage, and the room reads the same number (only the percentage and the reset time are stored).

```json
{"statusLine": {"type": "command", "command": "python3 /path/to/the/room/claude_statusline.py"}}
```

Without Hermes, these work the same: station, state, history, duration, failures, interrupted runs, lateness (through `cadencia_h`), the folder handoff and plan usage. Left out are the "what it is doing right now" panel, the "no action" warning, tokens and cost per agent, Jarvis and the scheduler room, which reads Hermes' scheduled jobs (cron jobs come in as agents, with lateness through `cadencia_h`).

**Using another orchestrator?** The room only reads a few simple files (a JSON catalog and one log line per run). The [input format](docs/FORMATO.md) (in Portuguese) explains each one; the same `registrar_execucao.py` turns any command into an agent in the room.

## Make it yours

- **Rooms and agents:** in `layout.json` you define the rooms and who sits in each one, by name or by prefix (for example, every `consulta_*` goes to CONSULTAS), plus each station's friendly name.
- **Jobs with a deadline:** scheduled jobs already carry their own schedule. For an agent that should run at a certain frequency, add `"cadencia_h": 24` to its entry (and `"cadencia_dias_uteis": true` to skip weekends): once it goes 1.2× that interval without running, it shows up as late.
- **Integrations:** the team queue in Agidesk and the note count of an Obsidian vault are set up in a local file (see `config.exemplo.json`). The access key lives in the macOS Keychain, never in the code.
- **New-version notice:** the room has a version number (the `VERSION` file). Every 2 hours it checks the `VERSION` published here on GitHub and, if it is higher than yours, shows a yellow banner at the top. To turn it off, set `"verificar_atualizacao": false` in the local config file.
- **Owner:** `"responsavel_padrao"` in the local config file applies to every station; `"responsavel"` in an agent's entry in `agentes.json` applies to that agent only.
- **Maintenance window:** with `manutencao.py` (the station is the agent's name or `cron:<job name>`):

```bash
python3 manutencao.py iniciar rateio_mensal --ate +2d --motivo "password change"
python3 manutencao.py listar
python3 manutencao.py encerrar rateio_mensal
```

- **Watcher (e-mail alerts and long job history):** schedule `python3 vigia_sala.py` every 5 minutes: on a Mac, `python3 agendar_mac.py` does it for you; on Linux, cron; on Windows, Task Scheduler. Without the `alerta_email` key in the config it only keeps the history; with it, it alerts a single address. The first run only records how things stand, with no e-mail.
- **For a TV:** open `/?tema=tv` (or `/?tema=pixeltv`, in pixel art) full screen; `&sala=<room id>` opens already zoomed into one room. If the TV has no keyboard or mouse, start Chrome with `--autoplay-policy=no-user-gesture-required` so sound plays without a click.

## Privacy and security

- **Runs on your computer only:** the server only accepts connections from the computer itself (`127.0.0.1`).
- **Outside websites can't read the room:** requests addressed to anything other than `127.0.0.1` or `localhost` are refused, so a malicious page open in your browser cannot read the room's data.
- **One outgoing connection, which you can turn off:** every 2 hours the server reads this repository's public `VERSION` file to warn about a new version. It sends none of your data (GitHub only sees the network address). With `"verificar_atualizacao": false` in the local config file, the room does not talk to the internet.
- **Read-only:** the room only watches the agents; it never triggers or changes anything. The optional watcher only writes the room's own history and sends the alert e-mail.
- **Zero tokens:** the room uses no AI model and only reads histories and state files.
- **Content stays on your computer:** the live panel shows excerpts of the agent's work (full reasoning, replies and commands, start of results), which may contain work data. These excerpts only go from the local server to the local browser, with safety cuts: `app_key` masked, home folder as `~`, lines with names and e-mails left out unless the request asks for a list. Nothing is stored or sent out. To see no content at all, choose "Summary" in SETTINGS.

## Quality

Two levels of tests come with the project:

- `python3 testes_servidor.py`: in about one second, checks the server logic with fictitious data (states, lateness, run start and end, the `registrar_execucao.py` wrapper, period and success rate, maintenance, the watcher with a fake e-mail sender, usage, team privacy and the security locks). It also runs on GitHub on every push, on Python 3.9 and 3.13.
- `python3 testar_sala.py`: opens the page in a browser across many scenarios (real data, demo, TV mode, 3D, pixel art, the folder handoff between rooms, late jobs, new agents and failures) and fails on any overlapping label, misplaced object, script error or individual team data.
- `python3 .github/checar_readmes.py`: checks that this README and the Portuguese version have the same sections, screenshots, tables and links. It runs on GitHub on every push, so the two versions never drift apart.

## Built with

Python 3 (standard library only), HTML, CSS and SVG with no frameworks, and [Three.js](https://threejs.org) for 3D, bundled in the project so it works offline.

## License

[MIT](LICENSE). Use it, adapt it and build the room for your own operation.
