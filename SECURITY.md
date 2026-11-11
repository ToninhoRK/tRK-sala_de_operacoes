# Segurança

## Versões suportadas

| Versão | Suportada |
| ------ | --------- |
| 1.3.1  | ✅        |
| < 1.3.1| ❌        |

## Reportar uma vulnerabilidade

Não abra issue pública para problemas de segurança. Mande um e-mail para o mantenedor pelo GitHub ou pelo canal que você usa para entrar em contato com ele. Inclua:

- a versão da Sala e do servidor Python;
- os passos para reproduzir;
- o impacto (ex.: dados que vazam, acesso fora do `127.0.0.1`).

## Princípios de segurança da Sala

- **Somente localhost:** o servidor só responde em `127.0.0.1`/`localhost`. Qualquer outro `Host` recebe `403`.
- **Somente leitura:** a Sala nunca inicia, para nem altera agentes ou jobs.
- **Nada por pessoa:** o painel mostra totais, nunca nomes nem números individuais da equipe.
- **Nenhum orçamento:** a Sala nunca lê dados de orçamento.
- **Nenhum conteúdo sai da máquina:** o que o agente faz só vai do servidor local para o navegador local (`/api/atividade` mostra raciocínio e comandos, com cortes: senhas, caminhos e nomes são ocultados).
- **Sem build nem dependências:** o front é HTML/CSS/JS clássicos; o servidor usa só a biblioteca padrão do Python.
- **Métodos não-GET retornam 501:** o servidor só aceita `GET` e `OPTIONS`.

## O que não é da Sala

- Credenciais do Agidesk, do Microsoft 365 e do Keychain do Mac ficam em `~/.hermes/data/sala_config.json` (fora deste repositório).
- O vault do Obsidian com orçamento e contratos não entra neste repositório.
