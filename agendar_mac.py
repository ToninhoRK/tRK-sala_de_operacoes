#!/usr/bin/env python3
"""Agenda a sala no Mac (launchd): o servidor sempre no ar e o vigia a cada 5 minutos.

  python3 agendar_mac.py               cria os dois agendamentos em ~/Library/LaunchAgents e liga
  python3 agendar_mac.py --simular     só mostra o que seria criado
  python3 agendar_mac.py --remover     desliga e apaga os dois
  python3 agendar_mac.py --porta 8770  outra porta (padrão 8765)
  python3 agendar_mac.py --sem-vigia   só o servidor

Usa o Python que rodou este script e a pasta onde ele está. Logs em ~/Library/Logs/sala-operacoes/.
Depois de ligar, a sala abre em http://127.0.0.1:<porta>/. Rode de novo depois de mover a pasta.
Linux: use o cron (`*/5 * * * * python3 /caminho/vigia_sala.py`) e um serviço do systemd para o server.py.
"""
import os
import plistlib
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
PREFIXO = os.environ.get("SALA_LAUNCHD_PREFIXO", "sala.operacoes")


def python_estavel():
    """O Python que rodou o script, pelo atalho estável quando houver (o Homebrew troca o caminho com a versão,
    /opt/homebrew/opt/python@3.14/..., e o agendamento quebraria na próxima atualização)."""
    py = sys.executable or "/usr/bin/python3"
    for atalho in (shutil.which("python3"), "/opt/homebrew/bin/python3", "/usr/local/bin/python3"):
        if atalho and os.path.exists(atalho) and os.path.realpath(atalho) == os.path.realpath(py):
            return atalho
    return py


def agendamentos(porta, vigia=True):
    logs = os.path.expanduser("~/Library/Logs/sala-operacoes")
    py = python_estavel()
    itens = {PREFIXO + ".servidor": {
        "Label": PREFIXO + ".servidor",
        "ProgramArguments": [py, os.path.join(AQUI, "server.py"), str(porta)],
        "WorkingDirectory": AQUI,
        "RunAtLoad": True, "KeepAlive": True, "ThrottleInterval": 10,
        "StandardOutPath": os.path.join(logs, "servidor.log"),
        "StandardErrorPath": os.path.join(logs, "servidor.error.log")}}
    if vigia:
        itens[PREFIXO + ".vigia"] = {
            "Label": PREFIXO + ".vigia",
            "ProgramArguments": [py, os.path.join(AQUI, "vigia_sala.py")],
            "WorkingDirectory": AQUI,
            "StartInterval": 300, "RunAtLoad": True,
            "StandardOutPath": os.path.join(logs, "vigia.log"),
            "StandardErrorPath": os.path.join(logs, "vigia.error.log")}
    return logs, itens


def launchctl(*args):
    return subprocess.run(["launchctl"] + list(args), capture_output=True, text=True)


def main(argv):
    porta = int(argv[argv.index("--porta") + 1]) if "--porta" in argv else 8765
    logs, itens = agendamentos(porta, "--sem-vigia" not in argv)
    pasta = os.path.expanduser("~/Library/LaunchAgents")
    dominio = "gui/%d" % os.getuid()
    if "--simular" in argv:
        for label, d in itens.items():
            print("# %s/%s.plist" % (pasta, label))
            print(plistlib.dumps(d).decode())
        return 0
    if sys.platform != "darwin":
        print("launchd só existe no Mac; no Linux, veja o fim do texto em `python3 agendar_mac.py --help`.")
        return 2
    if "--remover" in argv:
        for label in itens:
            launchctl("bootout", "%s/%s" % (dominio, label))
            p = os.path.join(pasta, label + ".plist")
            if os.path.exists(p):
                os.remove(p)
            print("removido:", label)
        return 0
    os.makedirs(pasta, exist_ok=True)
    os.makedirs(logs, exist_ok=True)
    codigo = 0
    for label, d in itens.items():
        p = os.path.join(pasta, label + ".plist")
        launchctl("bootout", "%s/%s" % (dominio, label))          # se já existia, recarrega com os caminhos novos
        with open(p, "wb") as f:
            plistlib.dump(d, f)
        r = launchctl("bootstrap", dominio, p)
        if r.returncode:
            print("NÃO ligou %s: %s" % (label, (r.stderr or r.stdout).strip()))
            codigo = 1
        else:
            print("ligado:", label)
    if not codigo:
        print("Pronto. A sala: http://127.0.0.1:%d/  ·  logs: %s" % (porta, logs))
    return codigo


if __name__ == "__main__":
    if "--help" in sys.argv or "-h" in sys.argv:
        print(__doc__)
        sys.exit(0)
    sys.exit(main(sys.argv[1:]))
