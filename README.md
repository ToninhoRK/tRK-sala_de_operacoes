# Sala de Operações

**Veja seus agentes de I.A. trabalhando.** A Sala de Operações transforma agentes, rotinas agendadas e a fila da equipe num escritório vivo, em que cada agente é um funcionário com mesa própria. Quem está rodando aparece sentado, digitando. Quem falhou se levanta e pede ajuda. Basta olhar para saber como a operação está, sem abrir log nem terminal.

![Sala de Operações: planta isométrica com salas, mesas e um funcionário por agente](docs/sala-de-operacoes.png)

<sub>Todas as capturas usam o modo demonstração, com agentes e números fictícios.</sub>

---

## Quatro jeitos de ver a mesma operação

### Planta: o dia a dia
A visão completa para quem acompanha de perto. Cada sala reúne um tipo de agente, e cada mesa mostra o nome do agente e o estado dele. Ao lado ficam o histórico de execuções, o modelo usado e a próxima rodada agendada. Clique numa mesa e veja os detalhes.

### Modo TV: para a parede da sala
Feito para ser lido de longe. Os indicadores ficam grandes, o painel lateral sai e a coluna **AGORA** mostra só o que importa no momento: o que falhou, o que está parado e o que está rodando. Quando está tudo bem, ela diz isso também.

![Modo TV: indicadores grandes e a coluna AGORA com falhas e execuções em andamento](docs/sala-tv.png)

### 3D: a mesma sala, com volume
A mesma planta, agora em 3D de verdade, com volume, luz e sombra. O ângulo, os móveis, as pessoas e os rótulos continuam no mesmo lugar, então a sala continua sendo a sua.

![Tema 3D: a mesma planta com volume, luz e sombra](docs/sala-3d.png)

### Pixel art: a mesma sala, com cara de jogo
A mesma planta redesenhada em pixels, com contorno em cada móvel e funcionários desenhados à mão, com as mesmas roupas e os mesmos gestos. Os nomes e os estados continuam nítidos por cima. Aproxime uma sala (roda do mouse ou clique na placa) para ver cada pixel. Também existe em versão para a TV.

![Tema pixel art: a mesma planta desenhada em pixels](docs/sala-pixel.png)

---

## O que você enxerga de relance

| Na sala | Significa |
|---|---|
| Funcionário sentado digitando, selo ciano | o agente está rodando agora |
| Funcionário circulando, selo verde | a última execução terminou bem |
| Funcionário de pé com um **!**, selo vermelho | a última execução falhou |
| Balão com **?**, em âmbar | o agente está rodando, mas sem nenhuma ação há 5 minutos |
| Relógio âmbar, "ATRASADO HÁ…" | uma rotina deveria ter rodado e não rodou |
| Rack piscando na sala do agendador | uma rotina agendada está em execução, com a próxima rodada ao lado |

No topo, um veredito responde antes de tudo: **NORMAL**, **ATENÇÃO** ou **FALHA**. Ao lado ficam os números do dia, a tendência dos últimos 7 dias, a última atividade e, se você quiser, o consumo do plano do Claude.

## Destaques

- **Trabalho passando de mão em mão:** quando um agente de uma cadeia começa a rodar, o funcionário da etapa anterior leva uma pasta até a mesa dele. Dá para ver a entrega de dados acontecer entre as salas.
- **Rotina atrasada não passa despercebida:** se um job agendado não disparou na hora (ou um agente passou do intervalo combinado sem rodar), a estação fica âmbar e o alarme avisa. Verde só quando está realmente em dia.
- **Alerta sonoro:** um som curto quando algo falha, trava ou atrasa, e outro mais suave quando volta ao normal. A sala continua de olho mesmo com a aba em segundo plano.
- **Atividade sem ruído:** execuções repetidas viram uma linha só ("×6 · desde 09:00"), o destaque fica só para o que fugiu do normal e um clique mostra **só as exceções**.
- **Tendência e consumo:** 7 dias de execuções e falhas no topo e em cada estação, com duração de cada execução e tokens e custo estimado por agente.
- **Nada some sem aviso:** execução que morreu no meio do caminho, sem chegar ao fim, aparece como **INTERROMPIDA**.
- **Escritório ou lista:** a chave OFFICE | LISTA no topo alterna entre a planta e as mesmas estações numa tabela ordenável por estado, sala, última execução ou consumo (a visão ativa fica acesa). Bom para o celular e para achar uma estação rápido. SOM e CENTRALIZAR também ficam no topo, junto com os demais controles.
- **Fluidez à vista:** o card Operação mostra os quadros por segundo da animação, atualizados a cada segundo (o normal é a taxa da tela: 60 num monitor comum). Número bem abaixo disso indica que a página está pesada para aquela máquina.
- **Pelo teclado:** Tab percorre as estações, Enter abre o detalhe e Esc fecha. As estações têm descrição para leitor de tela.
- **Do seu jeito:** pelo menu **CONFIGURAR** você escolhe o tema, a intensidade da animação, quais rótulos aparecem e se as estações mostram nomes amigáveis ("Consulta AD") ou o id técnico.
- **A equipe no mesmo lugar (opcional):** chamados em aberto, sem responsável, vencidos e encerrados no Agidesk, e o tempo de atendimento da semana, sempre como total da equipe. Ninguém vira placar individual.
- **Organiza-se sozinha:** agente novo ganha mesa automaticamente, e as salas crescem conforme a operação cresce.
- **Leve:** um servidor em Python puro e uma página no navegador. Nada de banco de dados, build ou dependências para instalar.
- **Qualquer tela:** do monitor ultrawide ao notebook (o painel lateral recolhe com um clique) e ao celular.

## Requisitos

| Para | Precisa de |
|---|---|
| Rodar a sala | **Python 3.9 ou mais novo** (testada no 3.9 e no 3.14; só a biblioteca padrão, nada para instalar com pip) |
| Ver a sala | um navegador atual. Testada no **Google Chrome**; Edge usa o mesmo motor. O tema 3D precisa de WebGL, que os navegadores atuais já trazem ligado |
| Dados de verdade | o **[Hermes](https://hermes-agent.nousresearch.com/docs)** instalado na mesma máquina. Sem ele, a sala abre com agentes de exemplo |
| Fila da equipe (opcional) | uma conta no **Agidesk** com chave de API, guardada no Keychain do macOS |
| Rodar os testes | o **Google Chrome** (o teste abre a página num Chrome invisível) |

Testada no macOS. O servidor é Python puro e deve rodar também em Linux e Windows, mas as integrações opcionais (Keychain) são do macOS.

## Comece em um minuto

```bash
git clone https://github.com/ToninhoRK/tRK-sala_de_operacoes.git
cd tRK-sala_de_operacoes
python3 server.py
```

Abra **http://127.0.0.1:8765** no navegador. Para ver todos os estados em ação, use **http://127.0.0.1:8765/?demo=1**.

Os dados vêm do [Hermes](https://hermes-agent.nousresearch.com/docs). Sem ele instalado, a sala abre com os agentes de exemplo da pasta `exemplo/`.

**Usa outro orquestrador?** A sala só lê alguns arquivos simples (catálogo em JSON e uma linha de log por execução). O [formato de entrada](docs/FORMATO.md) explica cada um e traz um embrulho de 15 linhas que transforma qualquer comando num agente da sala.

## Personalize

- **Salas e agentes:** em `layout.json` você define as salas e quem senta em cada uma, por nome ou por prefixo (por exemplo, todo `consulta_*` vai para CONSULTAS), e os nomes amigáveis de cada estação.
- **Rotinas com prazo:** os jobs agendados já trazem a própria agenda. Para um agente que deve rodar com certa frequência, acrescente `"cadencia_h": 24` na entrada dele (e `"cadencia_dias_uteis": true` para não contar o fim de semana): passou de 1,2× esse intervalo sem rodar, ele aparece como atrasado.
- **Integrações:** a fila da equipe no Agidesk e a contagem de notas de um vault do Obsidian são configuradas num arquivo local (veja `config.exemplo.json`). A chave de acesso fica no Keychain do macOS, nunca no código.
- **Para uma TV:** abra `/?tema=tv` (ou `/?tema=pixeltv`, em pixel art) em tela cheia; `&sala=<id da sala>` abre já aproximado numa sala. Se a TV não tiver teclado nem mouse, inicie o Chrome com `--autoplay-policy=no-user-gesture-required` para o som tocar sem precisar de clique.

## Privacidade e segurança

- **Roda só no seu computador:** o servidor só aceita conexões do próprio computador (`127.0.0.1`).
- **Somente leitura:** a sala só observa os agentes, nunca dispara nem altera nada.
- **Zero tokens:** a sala não usa modelo de I.A. e só lê históricos e arquivos de estado.
- **O conteúdo fica onde está:** o navegador recebe nome do agente, horário, modelo e resultado. Perguntas e respostas dos agentes nunca saem do lugar onde estão.

## Qualidade

Dois níveis de teste acompanham o projeto:

- `python3 testes_servidor.py`: em cerca de um segundo, confere a lógica do servidor com dados fictícios (estados, atraso, início e fim de execução, consumo, privacidade da equipe e as travas de segurança). Roda também no GitHub a cada envio, em Python 3.9 e 3.13.
- `python3 testar_sala.py`: abre a página num navegador em vários cenários (dados reais, demonstração, Modo TV, 3D, pixel art, a pasta entre salas, atrasos, agentes novos e falhas) e reprova qualquer rótulo sobreposto, objeto fora do lugar, erro de script ou dado individual da equipe.

## Feito com

Python 3 (só a biblioteca padrão), HTML, CSS e SVG sem frameworks, e [Three.js](https://threejs.org) para o 3D, incluído no projeto para funcionar sem internet.

## Licença

[MIT](LICENSE). Use, adapte e monte a sala da sua operação.
