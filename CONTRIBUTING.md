# CONTRIBUTING

Obrigado por querer ajudar. A Sala de Operações é um painel local, somente leitura, que mostra agentes de IA e jobs agendados como estações de um escritório. Foi feita para ser leve: **sem build, sem dependências no front e servidor com apenas a biblioteca padrão do Python**.

## Como contribuir

1. Abra uma issue descrevendo o que pretende mudar. Se for algo grande, espere a resposta antes de enviar um pull request.
2. Fork o repositório, crie um branch a partir de `main` e faça suas alterações.
3. Rode os testes antes de enviar:

   ```bash
   python3 testes_servidor.py
   python3 testar_sala.py --rapido   # ~3 min, precisa do Chrome
   ```

   Os dois devem sair com código 0 e sem itens em `saúde`.
4. Não reescreva arquivos inteiros: mude uma coisa de cada vez.
5. Se mudar algo visível na tela, atualize também `README.en.md` e as capturas de `docs/` e `docs/en/` (todas com `?demo=1` e nomes fictícios, nunca dados reais).
6. Envie o pull request. Um mantenedor revisa e faz o merge — você não precisa de aprovação para abrir, mas o merge precisa de um revisor.

## Regras do projeto (não mude sem discutir antes)

- A Sala nunca dispara nem altera agentes (somente leitura).
- O padrão de acesso é `127.0.0.1`; expor fora do localhost só com decisão explícita do dono.
- Nada por pessoa da equipe: só totais.
- A Sala nunca lê orçamento.
- Cada cor tem um único sentido.
- E-mail de alerta para um único destinatário.
- Pixel art só como opção, nunca padrão.
- fps sempre visível, sem cor, fora do veredito e do som, não configurável.

## Primeira contribuição indicada

As pastas `conectores/` (regras prontas para Claude Code, Codex, cron/systemd, Python e n8n) são um bom primeiro pull request: cada conector é pequeno, testável e não mexe no núcleo.

---

# CONTRIBUTING

Thank you for wanting to help. The Operations Room is a local, read-only panel that shows AI agents and scheduled jobs as stations of an office. It was made to be light: **no build, no front-end dependencies, and a server using only the Python standard library**.

## How to contribute

1. Open an issue describing what you intend to change. If it is something big, wait for a response before sending a pull request.
2. Fork the repository, create a branch from `main` and make your changes.
3. Run the tests before sending:

   ```bash
   python3 testes_servidor.py
   python3 testar_sala.py --rapido   # ~3 min, needs Chrome
   ```

   Both must exit with code 0 and no items in `health`.
4. Do not rewrite whole files: change one thing at a time.
5. If you change anything visible on the screen, also update `README.en.md` and the captures in `docs/` and `docs/en/` (all with `?demo=1` and fictitious names, never real data).
6. Send the pull request. A maintainer reviews and merges — you do not need approval to open, but the merge needs a reviewer.

## Project rules (do not change without discussing first)

- The Room never starts or stops agents (read-only).
- Default access is `127.0.0.1`; exposing outside localhost only with explicit owner decision.
- Nothing per team member: totals only.
- The Room never reads the budget.
- Each color has one single meaning.
- Alert email to a single recipient only.
- Pixel art only as an option, never default.
- fps always visible, no colour, outside the verdict and the sound, not configurable.

## Good first contribution

The `conectores/` folder (ready-made rules for Claude Code, Codex, cron/systemd, Python and n8n) is a good first pull request: each connector is small, testable and does not touch the core.
