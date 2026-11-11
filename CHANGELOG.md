# CHANGELOG

Todas as mudanças notáveis da Sala de Operações.

## 1.3.1 — 10/11/2026

- Corrige `servidor_mem_mb`: estava 1000× maior (divisor de bytes em vez de megabytes).
- Primeira release com `VERSION` 1.3.1 no repositório.

## 1.3.0 — Fase 1 (23/10/2026)

- Política de segurança de conteúdo (CSP) e cabeçalhos `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options` e `Cache-Control`.
- Contraste WCAG 2.2: texto secundário clareado, cores de estado intactas, zeros apagados.
- CPU e memória ao lado do fps (sem cor, fora do veredito e do som).
- Avisos de infraestrutura no vigia: gateway parado, disco abaixo de 10%, bateria abaixo de 20% fora da tomada.
- Meta de sucesso (SLO) de cada job, vinda de `sala_config.json` (padrão 95%).
- Código de teste separado de `poll()` (`?ff`, `?testrun`, `?testpasta` saem do fluxo normal da página).
- Script `scripts/criar_indice_state_db.py` para indexar o `state.db` (uma vez; não é criado pelo servidor).
- Versão do contrato `/api/state`: 6.

## 1.2.5 — Fase 0 (15/10/2026)

- Correções de robustez P1–P9: catálogo/JSON ilegível não derruba o painel, sem dados do servidor não vira "NORMAL", nomes de job com aspas ou HTML não quebram a planta, tendência não duplica execuções, conexões ociosas fecham, fila de escuta maior.
- Sinal de vida do vigia só depois de ler a Sala com sucesso.
- Tela JOBS (terceira opção da chave: OFFICE | LISTA | JOBS), nomes de job com inicial maiúscula, índice de sucesso e duração dos jobs.
- Interface em inglês (língua do navegador ou `?lang=en|pt`).
- Tema pixel art (opção no CONFIGURAR, nunca padrão).
- Tema 3D fiel à planta.
- Versão do contrato `/api/state`: 6.

## Anterior

- Veredito da operação, rotina atrasada, início e fim das execuções, tendência de 7 dias, consumo por agente, nomes amigáveis, modo lista, teclado.
- Equipe só no total (nada por pessoa), som de alerta opcional.
- Botões no cabeçalho (OFFICE | LISTA, SOM, CENTRALIZAR), fps no card Operação, animação reduzida a 15 quadros/s.
- Pasta entre salas nas cadeias de agentes, `?sala=` para abrir numa sala.
- Embrulho `registrar_execucao.py` para usar a Sala com o Claude Code sem o Hermes.

---

# CHANGELOG

All notable changes to the Operations Room.

## 1.3.1 — 10/11/2026

- Fix `servidor_mem_mb`: it was 1000× too high (bytes divided by the wrong factor).
- First release with `VERSION` 1.3.1 in the repository.

## 1.3.0 — Phase 1 (23/10/2026)

- Content Security Policy and headers `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`, `Cache-Control`.
- WCAG 2.2 contrast: lightened secondary text, state colors intact, faded zeros.
- CPU and memory next to the fps (no colour, outside the verdict and the sound).
- Infrastructure warnings in the watcher: gateway stopped, disk below 10%, battery below 20% unplugged.
- Success target (SLO) per job, from `sala_config.json` (default 95%).
- Test code separated from `poll()` (`?ff`, `?testrun`, `?testpasta` leave the normal page flow).
- Script `scripts/criar_indice_state_db.py` to index `state.db` (once; not created by the server).
- `/api/state` contract version: 6.

## 1.2.5 — Phase 0 (15/10/2026)

- Robustness fixes P1–P9: illegible catalog/JSON does not crash the panel, no server data does not become "NORMAL", job names with quotes or HTML do not break the panel, tendency does not double-count executions, idle connections close, larger listen queue.
- Watcher's life signal only after successfully reading the Room.
- JOBS screen (third key option: OFFICE | LISTA | JOBS), job names with initial capital, success rate and job duration.
- English interface (browser language or `?lang=en|pt`).
- Pixel art theme (option in CONFIGURE, never default).
- 3D theme faithful to the floor plan.
- `/api/state` contract version: 6.

## Before

- Operation verdict, late routine, start and end of executions, 7-day trend, per-agent consumption, friendly names, list view, keyboard.
- Team in totals only (nothing per person), optional alert sound.
- Header buttons (OFFICE | LISTA, SOUND, CENTER), fps in the Operation card, reduced animation at 15 frames/s.
- Folder between rooms in agent chains, `?sala=` to open a room.
- `registrar_execucao.py` wrapper to use the Room with Claude Code without Hermes.
