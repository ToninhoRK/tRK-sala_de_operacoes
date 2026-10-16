# Formato de entrada

A Sala de Operações só **lê** arquivos. Ela nasceu para o [Hermes](https://hermes-agent.nousresearch.com/docs), mas qualquer
orquestrador de agentes ou agendador pode alimentá-la, desde que grave os arquivos abaixo. Nada aqui é obrigatório além do
catálogo: o que faltar simplesmente não aparece.

| Arquivo | Para quê | Obrigatório |
|---|---|---|
| `~/.hermes/scripts/agentes.json` | catálogo: quem são os agentes | sim (sem ele, a sala usa `exemplo/`) |
| `~/.hermes/data/agentes/*.log` | histórico: cada execução terminada | sim, para haver estado |
| `~/.hermes/data/agentes/eventos.jsonl` | início e fim de cada execução (rodando, duração, interrompidas, custo exato) | não, recomendado |
| `~/.hermes/cron/jobs.json` | rotinas agendadas e o próximo horário de cada uma (atraso) | não |
| `layout.json` (pasta da sala) | salas, quem senta onde e nomes amigáveis | já vem pronto |
| `~/.hermes/data/equipe_agidesk.json` | totais da fila da equipe | não |
| `~/.hermes/data/vault_contagem.json` | painel do vault (notas e auditoria) | não |
| `~/.hermes/data/claude_uso.json` | uso do plano do Claude | não |

Os caminhos de `agentes.json` e `jobs.json` podem ser trocados pelas variáveis de ambiente `SALA_AGENTES` e `SALA_JOBS`
(e o da equipe por `SALA_EQUIPE`).

## Catálogo: `agentes.json`

Um objeto com uma entrada por agente. A chave é o id do agente (letras minúsculas, números e `_`).

```json
{
  "consulta_estoque": {
    "descricao": "Responde perguntas sobre o estoque (somente leitura)",
    "modelo": "nome-do-modelo",
    "provedor": "opcional",
    "skills": ["opcional"],
    "max_turns": 30,
    "timeout_s": 1800,
    "setor": "consultas",
    "cadencia_h": 24,
    "cadencia_dias_uteis": true
  }
}
```

| Campo | Uso na sala |
|---|---|
| `descricao`, `modelo` | detalhe da estação |
| `provedor`, `skills`, `max_turns`, `timeout_s` | detalhe da estação (opcionais) |
| `setor` | força a sala do agente (senão vale o `layout.json`) |
| `cadencia_h` | o agente deve rodar ao menos a cada N horas: passou de 1,2 × N sem rodar, ele fica **atrasado** |
| `cadencia_dias_uteis` | com `true`, sábado e domingo não contam para a cadência |
| `cron_job` | nome de um job em `jobs.json` que faz o trabalho do agente sem passar por ele: a estação mostra a execução mais nova dos dois |
| `responsavel` | quem responde pelo agente (detalhe, lista e CSV); sem ele, vale o `responsavel_padrao` da configuração local |

Campos desconhecidos são ignorados.

## Histórico: `*.log`

Cada execução **terminada** acrescenta um cabeçalho num arquivo `.log` qualquer da pasta (o nome do arquivo não importa: vale
o id que está no cabeçalho). Depois do cabeçalho pode vir qualquer texto; a sala **não lê** o conteúdo.

```
===== 2026-10-15 14:03:27 · [Agente consulta_estoque · modelo: nome-do-modelo] · código 0
```

- A data e hora são as do **fim** da execução, no horário local.
- `código 0` = OK; qualquer outro número = falha.
- Se a execução precisou trocar de modelo, acrescente ` · ATENÇÃO: <motivo>` antes do `]`: a sala marca **FALLBACK**.

## Início e fim: `eventos.jsonl`

Uma linha JSON por evento. Sem este arquivo, "rodando agora" depende de achar o processo `rodar_agente.py <agente>` no
sistema e não há duração nem execuções interrompidas.

```json
{"ev": "inicio", "agente": "consulta_estoque", "pid": 4242, "t": 1792088400.0}
{"ev": "fim", "agente": "consulta_estoque", "pid": 4242, "t": 1792088465.3, "codigo": 0, "duracao_s": 65.3, "modelo": "nome-do-modelo", "sessoes": []}
```

| Situação | O que a sala mostra |
|---|---|
| `inicio` sem `fim` e o processo `pid` está vivo | **rodando**, com o tempo desde `t` |
| `fim` com cabeçalho no log (até 10 s de diferença) | a execução do log, com a duração |
| `fim` com `codigo` diferente de 0 e **sem** cabeçalho no log | falha **INTERROMPIDA** (ex.: processo morto por sinal) |
| `inicio` sem `fim` e o processo já morreu | falha **INTERROMPIDA** |

`t` é o horário Unix em segundos. `sessoes` é opcional: no Hermes, são os ids da tabela `sessions` do `state.db`, de onde
saem tokens e custo exatos.

### Sem o Hermes: `registrar_execucao.py`

O `registrar_execucao.py`, na pasta da sala, roda qualquer comando como se fosse um agente e grava os dois arquivos
(evento de início e fim + cabeçalho no log). A saída do comando aparece no terminal e não é gravada. Exemplo com um agente
do Claude Code:

```bash
python3 registrar_execucao.py resumo_diario --modelo claude-sonnet -- claude -p "Resuma os chamados abertos hoje"
```

- O código de saída do comando vira o resultado (0 = OK). Interrompido por Ctrl+C ou `kill`, o sinal é repassado ao
  comando e aos filhos dele e a execução é registrada como falha (130 ou 143).
- Comando inexistente = código 127. Sem `--modelo`, o modelo aparece como "—".
- O agente também precisa estar no `agentes.json` (ou no arquivo de `SALA_AGENTES`): nome fora do catálogo é recusado com código 2, sem rodar o comando e sem gravar nada.

## Rotinas agendadas: `jobs.json`

```json
{"jobs": [{
  "id": "a1b2c3", "name": "relatorio-diario", "enabled": true,
  "schedule": {"expr": "0 8 * * 1-5", "display": "dias úteis às 08:00"},
  "next_run_at": "2026-10-16T08:00:00-03:00",
  "last_run_at": "2026-10-15T08:00:41-03:00",
  "last_status": "ok",
  "script": "relatorio_diario.py"
}]}
```

- `last_status` diferente de `ok` (e não vazio) = **falha**.
- `enabled: false`, `paused_at` preenchido ou `state: "paused"` = pausado (cinza, nunca atrasado).
- `next_run_at` vencido há mais de 10 min, com o job ativo e sem estar rodando = **ATRASADO**.
- Jobs cujo nome começa com `avulso-` não aparecem.

Execuções individuais, "rodando agora" e a contagem do dia de cada job vêm do banco `executions.db` do agendador do
Hermes; sem ele, o job aparece só com o estado do `jobs.json`.

## Salas e nomes: `layout.json`

- `setores`: lista de salas na ordem em que aparecem (`id`, `titulo`, `linha` `cima` ou `baixo`, `agentes`, `prefixos`,
  `tipo` `cron`/`jarvis`/`equipe`/`reuniao`). Prioridade para escolher a sala de um agente: `setor` do catálogo > lista
  `agentes` > `prefixos` (vence o mais longo) > `padrao`.
- `fluxos`: pares `[origem, destino]` desenhados como linhas entre estações.
- `nomes`: `{"id do agente": "Nome amigável", "cron:<nome do job>": "Nome"}`. Sem entrada, aparece o id. Nomes até ~18
  letras cabem no rótulo da planta. Em CONFIGURAR > Nomes > Técnicos, a sala volta a mostrar os ids.

## Painéis opcionais

- `equipe_agidesk.json`: `{"updated_at": <unix>, "dia": "AAAA-MM-DD", "abertos_total": 84, "sem_responsavel": 6,
  "vencidos": 12, "encerrados_hoje_total": 8, "encerrados_7d": 35, "atendimento_medio_h_7d": 34.6,
  "atendimento_mediano_h_7d": 15.1}`. Só totais da equipe: a sala não aceita números por pessoa. Leitura com mais de
  15 min aparece como defasada.
- `vault_contagem.json`: `{"updated_at": <unix>, "total": 904, "historico": {...}, "auditoria": {"divergencias": 0, "checado_em": <unix>}}`.
- `claude_uso.json`: `{"updated_at": <unix>, "five_hour": {"used_percentage": 34, "resets_at": <unix>}, "seven_day": {...}}`.

## Gravados pela própria sala

- `sala_historico_cron.jsonl` (gravado pelo `vigia_sala.py`): uma linha por execução de job que trabalhou (> 5 s) ou falhou,
  `{"job_id": "...", "job": "nome", "status": "completed|failed", "started_at": "<ISO 8601>", "finished_at": "<ISO 8601>"}`.
  Guarda 100 dias. O banco de execuções do Hermes guarda só as últimas ~1000 (uns 2 dias); sem este arquivo, os períodos
  longos dos jobs mostram só esses dias.
- `sala_manutencao.json` (gravado pelo `manutencao.py`): `{"janelas": [{"id": "agente ou cron:<job>", "de": "AAAA-MM-DD HH:MM",
  "ate": "AAAA-MM-DD HH:MM", "motivo": "..."}]}`. Dentro da janela, a estação aparece como MANUTENÇÃO, falha e atraso não
  alarmam e as execuções ficam fora do índice de sucesso. Janelas encerradas há mais de 120 dias são descartadas.
- `sala_alerta_base.json` (gravado pelo `vigia_sala.py`): o retrato da rodada anterior, para o e-mail sair só quando algo muda.

## Configuração local: `sala_config.json`

Fica fora do repositório (modelo em `config.exemplo.json`). Além das chaves do Agidesk e do vault:

- `responsavel_padrao`: responsável de toda estação sem `responsavel` próprio.
- `alerta_email`: `{"para": "um endereço só", "de": "remetente", "conta_himalaya": "conta de envio"}`. Sem esta chave, o vigia
  só guarda o histórico. Mais de um endereço em `para` é recusado.
