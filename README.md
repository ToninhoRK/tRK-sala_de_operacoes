# Sala de Operações

**Veja seus agentes de I.A. trabalhando.** A Sala de Operações transforma agentes, rotinas agendadas e a fila da equipe num escritório vivo, em que cada agente é um funcionário com mesa própria. Quem está rodando aparece sentado, digitando. Quem falhou se levanta e pede ajuda. Basta olhar para saber como a operação está, sem abrir log nem terminal.

![Sala de Operações: planta isométrica com salas, mesas e um funcionário por agente](docs/sala-de-operacoes.png)

<sub>Todas as capturas usam o modo demonstração, com agentes e números fictícios.</sub>

---

## Três jeitos de ver a mesma operação

### Planta: o dia a dia
A visão completa para quem acompanha de perto. Cada sala reúne um tipo de agente, e cada mesa mostra o nome do agente e o estado dele. Ao lado ficam o histórico de execuções, o modelo usado e a próxima rodada agendada. Clique numa mesa e veja os detalhes.

### Modo TV: para a parede da sala
Feito para ser lido de longe. Os indicadores ficam grandes, o painel lateral sai e a coluna **AGORA** mostra só o que importa no momento: o que falhou, o que está parado e o que está rodando. Quando está tudo bem, ela diz isso também.

![Modo TV: indicadores grandes e a coluna AGORA com falhas e execuções em andamento](docs/sala-tv.png)

### 3D: a mesma sala, com volume
A mesma planta, agora em 3D de verdade, com volume, luz e sombra. O ângulo, os móveis, as pessoas e os rótulos continuam no mesmo lugar, então a sala continua sendo a sua.

![Tema 3D: a mesma planta com volume, luz e sombra](docs/sala-3d.png)

---

## O que você enxerga de relance

| Na sala | Significa |
|---|---|
| Funcionário sentado digitando, selo ciano | o agente está rodando agora |
| Funcionário circulando, selo verde | a última execução terminou bem |
| Funcionário de pé com um **!**, selo vermelho | a última execução falhou |
| Balão com **?**, em âmbar | o agente está rodando, mas sem nenhuma ação há 5 minutos |
| Rack piscando na sala do agendador | uma rotina agendada está em execução, com a próxima rodada ao lado |

No topo ficam os números do dia: quantos agentes estão em execução, quantas execuções e falhas houve hoje, quando foi a última atividade e, se você quiser, o consumo do plano do Claude.

## Destaques

- **Alerta sonoro:** um som curto quando algo falha ou trava e outro mais suave quando volta ao normal. A sala continua de olho mesmo com a aba em segundo plano.
- **Do seu jeito:** pelo menu **CONFIGURAR** você escolhe o tema, a intensidade da animação e quais rótulos aparecem (todos, nomes com estado só de quem está rodando ou falhou, só os problemas, ou nenhum).
- **A equipe no mesmo lugar (opcional):** chamados em aberto, sem responsável e encerrados hoje no Agidesk, sempre como total da equipe. Ninguém vira placar individual.
- **Organiza-se sozinha:** agente novo ganha mesa automaticamente, e as salas crescem conforme a operação cresce.
- **Leve:** um servidor em Python puro e uma página no navegador. Nada de banco de dados, build ou dependências para instalar.

## Comece em um minuto

```bash
git clone https://github.com/ToninhoRK/tRK-sala_de_operacoes.git
cd tRK-sala_de_operacoes
python3 server.py
```

Abra **http://127.0.0.1:8765** no navegador. Para ver todos os estados em ação, use **http://127.0.0.1:8765/?demo=1**.

Os dados vêm do [Hermes](https://hermes-agent.nousresearch.com/docs). Sem ele instalado, a sala abre com os agentes de exemplo da pasta `exemplo/`.

## Personalize

- **Salas e agentes:** em `layout.json` você define as salas e quem senta em cada uma, por nome ou por prefixo (por exemplo, todo `consulta_*` vai para CONSULTAS).
- **Integrações:** a fila da equipe no Agidesk e a contagem de notas de um vault do Obsidian são configuradas num arquivo local (veja `config.exemplo.json`). A chave de acesso fica no Keychain do macOS, nunca no código.
- **Para uma TV:** abra `/?tema=tv` em tela cheia. Se a TV não tiver teclado nem mouse, inicie o Chrome com `--autoplay-policy=no-user-gesture-required` para o som tocar sem precisar de clique.

## Privacidade e segurança

- **Roda só no seu computador:** o servidor só aceita conexões do próprio computador (`127.0.0.1`).
- **Somente leitura:** a sala só observa os agentes, nunca dispara nem altera nada.
- **Zero tokens:** a sala não usa modelo de I.A. e só lê históricos e arquivos de estado.
- **O conteúdo fica onde está:** o navegador recebe nome do agente, horário, modelo e resultado. Perguntas e respostas dos agentes nunca saem do lugar onde estão.

## Qualidade

A sala vem com um teste automático (`python3 testar_sala.py`). Ele abre a página num navegador em vários cenários (dados reais, demonstração, Modo TV, 3D, agentes novos e falhas) e reprova qualquer rótulo sobreposto, objeto fora do lugar, erro de script ou dado individual da equipe. Para rodar o teste é preciso ter o Google Chrome instalado.

## Feito com

Python 3 (só a biblioteca padrão), HTML, CSS e SVG sem frameworks, e [Three.js](https://threejs.org) para o 3D, incluído no projeto para funcionar sem internet.

## Licença

[MIT](LICENSE). Use, adapte e monte a sala da sua operação.
