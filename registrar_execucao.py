#!/usr/bin/env python3
"""Roda qualquer comando como um agente da Sala de Operações e registra a execução (início, fim, código e duração).

Feito para quem não usa o Hermes: por exemplo, um agente do Claude Code em modo não interativo (claude -p).
Grava os mesmos arquivos que o executor do Hermes grava (formato em docs/FORMATO.md):
  ~/.hermes/data/agentes/eventos.jsonl   início e fim (a sala mostra "rodando" e a duração)
  ~/.hermes/data/agentes/<agente>.log    cabeçalho da execução terminada (histórico, OK ou falha)
A saída do comando aparece no terminal normalmente e NÃO é gravada: a sala nunca lê o que o agente respondeu.

Uso:
  python3 registrar_execucao.py <agente> [--modelo <nome>] -- <comando> [argumentos...]
Exemplo (Claude Code):
  python3 registrar_execucao.py consulta_estoque --modelo claude-sonnet -- claude -p "Resuma o estoque de hoje"
O agente precisa estar no catálogo (~/.hermes/scripts/agentes.json ou o arquivo de SALA_AGENTES).
Runs any command as a Sala de Operações agent and records start, end, exit code and duration (output is never stored).
"""
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime

PASTA = os.path.expanduser("~/.hermes/data/agentes")


def main(argv):
    if "--" not in argv or argv.index("--") < 1:
        print("uso: python3 registrar_execucao.py <agente> [--modelo <nome>] -- <comando> [argumentos...]", file=sys.stderr)
        return 2
    i = argv.index("--")
    opcoes, comando = argv[:i], argv[i + 1:]
    agente, modelo = opcoes[0], "—"
    if "--modelo" in opcoes and opcoes.index("--modelo") + 1 < len(opcoes):
        modelo = opcoes[opcoes.index("--modelo") + 1]
    if not comando:
        print("faltou o comando depois de --", file=sys.stderr)
        return 2
    os.makedirs(PASTA, exist_ok=True)

    def evento(**d):
        with open(os.path.join(PASTA, "eventos.jsonl"), "a", encoding="utf8") as f:
            f.write(json.dumps(dict(d, agente=agente, pid=os.getpid(), t=time.time()), ensure_ascii=False) + "\n")

    evento(ev="inicio")
    t0 = time.time()
    proc = None
    try:
        proc = subprocess.Popen(comando, start_new_session=True)     # grupo próprio: o sinal chega também aos filhos do comando
        # interrompido (Ctrl+C ou kill): repassa o sinal ao grupo do comando e registra o fim mesmo assim (sem processo órfão)
        def repassar(n, f):
            try:
                os.killpg(proc.pid, n)
            except ProcessLookupError:
                pass
        for s in (signal.SIGINT, signal.SIGTERM):
            signal.signal(s, repassar)
        codigo = proc.wait()
    except FileNotFoundError:
        print("comando não encontrado: %s" % comando[0], file=sys.stderr)
        codigo = 127
    codigo = codigo if codigo >= 0 else 128 - codigo          # morto por sinal: 128 + número do sinal, como no shell
    with open(os.path.join(PASTA, agente + ".log"), "a", encoding="utf8") as f:
        f.write("\n===== %s · [Agente %s · modelo: %s] · código %d\n" % (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), agente, modelo, codigo))
    evento(ev="fim", codigo=codigo, duracao_s=round(time.time() - t0, 1), modelo=modelo, sessoes=[])
    return codigo


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
