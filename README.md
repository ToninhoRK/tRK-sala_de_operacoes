# Sala de Operações - Monitoramento de Agentes de I.A.

Painel local, em visão isométrica, que mostra o estado de agentes de I.A. do [Hermes](https://hermes-agent.nousresearch.com/docs), dos jobs agendados (cron) e, opcionalmente, da fila de chamados de uma equipe no Agidesk. Cada agente é um boneco numa sala; o estado real (rodando, ok, erro) define o que ele faz.

![Sala de Operações em modo demonstração: salas CONSULTAS, OPERAÇÕES, GOVERNANÇA, DIRETORIA e AGENDADOR, com um boneco por agente e por pessoa](docs/sala-de-operacoes.png)

*Captura em modo demonstração (`?demo=1`), com agentes, pessoas e números fictícios.*

- **Somente leitura e local:** o servidor escuta só em `127.0.0.1` (porta 8765 por padrão) e não grava nada além dos próprios arquivos de números em `~/.hermes/data/`.
- **Sem modelo de I.A. e sem gastar tokens:** o painel só lê arquivos de histórico, o banco de estado do Hermes e a API do Agidesk.
- **Privacidade:** o navegador recebe só nome do agente, hora, modelo e código de saída. O conteúdo das respostas nunca é enviado.
- **Só atende o próprio computador:** pedidos com outro nome de host recebem 403 (proteção contra *DNS rebinding*).
- **Só biblioteca padrão do Python 3.** Testado no macOS.

## Rodar

```
python3 server.py            # http://127.0.0.1:8765
python3 server.py 8800       # outra porta
```

Sem o Hermes instalado, o painel abre com os dados fictícios de `exemplo/` (`agentes.json`, `cron_jobs.json`). Acrescente `?demo=1` à URL para ver os estados de exemplo (rodando, erro, ocioso).

## Testar

```
python3 testar_sala.py            # ~5 min: dados atuais, demonstração e cenários fictícios (agente novo, cron com falha, 4 e 6 pessoas)
python3 testar_sala.py --rapido   # ~2 min
```

Precisa do Google Chrome (`CHROME=<caminho>` para outro local). Os cenários usam arquivos temporários; nada real é alterado. Os contadores do diagnóstico (`?debug=1`) devem ficar todos em 0.

## Configuração local (fora do repositório)

Os scripts que falam com sistemas reais leem os valores de `~/.hermes/data/sala_config.json` (ou do arquivo apontado por `$SALA_CONFIG`). Copie `config.exemplo.json` e preencha:

| Chave | Para quê |
|---|---|
| `agidesk_url` | URL base da API do Agidesk |
| `agidesk_keychain_account` / `agidesk_keychain_service` | item do Keychain (macOS) que guarda a chave de aplicação do Agidesk; lida só em memória |
| `equipe_id` | equipe cujos chamados a sala "GOVERNANÇA" mostra |
| `vault_path` | pasta do vault do Obsidian a contar (placa da DIRETORIA) |

Sem o arquivo, os scripts recusam rodar e dizem o que falta; nada é inventado.

## Arquivos

| Arquivo | Função |
|---|---|
| `server.py` | servidor HTTP local e montagem da planta |
| `index.html` | a interface (canvas isométrico, sem dependências externas) |
| `layout.json` | em qual sala cada agente aparece (salas, prefixos, fluxos) |
| `equipe_agidesk.py` | job de cron (a cada 5 min): chamados em aberto e encerrados hoje por pessoa; só GET |
| `vault_contagem.py` | job de cron: contagem de notas do vault para a placa da DIRETORIA |
| `claude_uso_poll.py` | opcional: percentual de uso do plano do Claude Code, lido com o token que o próprio Claude Code guarda |
| `sala_config.py` | leitura da configuração local |
| `testar_sala.py` | teste automático: abre a página no Chrome headless com `?debug=1` em vários cenários e falha se houver sobreposição, objeto atravessado, erro de JavaScript ou API incoerente |
| `exemplo/` | dados fictícios para rodar sem o Hermes |

Os jobs de cron são agendados no Hermes como jobs sem agente (`--no-agent`), apontando para os scripts acima.

## Licença

[MIT](LICENSE).
