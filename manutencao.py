#!/usr/bin/env python3
"""Janelas de manutenção da Sala de Operações.

Durante a janela, a estação aparece como MANUTENÇÃO (selo lilás): falha e atraso não alarmam (veredito, som, e-mail do
vigia) e as execuções de dentro da janela ficam fora do índice de sucesso. Se rodar, continua aparecendo rodando.
Grava ~/.hermes/data/sala_manutencao.json (ou $SALA_MANUT); o histórico das janelas fica no arquivo (o índice dos períodos
passados depende dele) e janelas encerradas há mais de 120 dias são descartadas.

  python3 manutencao.py listar
  python3 manutencao.py iniciar <estação> --ate "2026-10-20 18:00" [--de "2026-10-16 08:00"] [--motivo "troca de senha"]
  python3 manutencao.py iniciar <estação> --ate +4h          (ou +2d: a partir de agora)
  python3 manutencao.py encerrar <estação>                    (fecha agora a janela em andamento)

<estação> = nome do agente no agentes.json ou "cron:<nome do job>".
Maintenance windows: alarms are muted and runs inside the window are left out of the success rate.
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import server  # noqa: E402

FMT = "%Y-%m-%d %H:%M"


def ler():
    try:
        d = server.ler_json(server.MANUT)
        return d if isinstance(d, dict) and isinstance(d.get("janelas"), list) else {"janelas": []}
    except FileNotFoundError:
        return {"janelas": []}


def gravar(d):
    corte = datetime.now() - timedelta(days=120)
    d["janelas"] = [j for j in d["janelas"] if datetime.strptime(j["ate"], FMT) >= corte]
    os.makedirs(os.path.dirname(server.MANUT), exist_ok=True)
    tmp = server.MANUT + ".tmp"
    with open(tmp, "w", encoding="utf8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    os.replace(tmp, server.MANUT)


def quando(txt, agora):
    m = re.fullmatch(r"\+(\d+)([hd])", txt.strip())
    if m:
        return agora + timedelta(hours=int(m.group(1)) * (24 if m.group(2) == "d" else 1))
    return datetime.strptime(txt.strip(), FMT)


def estacoes():
    ids = set()
    try:
        ids |= set(server.ler_json(server.AGENTES))
    except Exception:
        pass
    try:
        j = server.ler_json(server.JOBS)
        ids |= {"cron:" + x["name"] for x in (j["jobs"] if isinstance(j, dict) else j)}
    except Exception:
        pass
    return ids


def main(argv):
    ap = argparse.ArgumentParser(description="Janelas de manutenção da Sala de Operações")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("listar")
    i = sub.add_parser("iniciar")
    i.add_argument("estacao")
    i.add_argument("--ate", required=True)
    i.add_argument("--de")
    i.add_argument("--motivo", default="")
    e = sub.add_parser("encerrar")
    e.add_argument("estacao")
    a = ap.parse_args(argv)
    agora = datetime.now().replace(second=0, microsecond=0)
    d = ler()
    if a.cmd == "listar":
        if not d["janelas"]:
            print("nenhuma janela de manutenção")
        for j in sorted(d["janelas"], key=lambda j: j["de"]):
            ativa = j["de"] <= agora.strftime(FMT) <= j["ate"]
            print("%s  %s  %s → %s  %s" % ("ATIVA " if ativa else "      ", j["id"], j["de"], j["ate"], j.get("motivo", "")))
        return 0
    if a.estacao not in estacoes():
        print("estação desconhecida: %s (use o nome do agente ou cron:<nome do job>)" % a.estacao, file=sys.stderr)
        return 2
    if a.cmd == "iniciar":
        try:
            de = quando(a.de, agora) if a.de else agora
            ate = quando(a.ate, agora)
        except ValueError:
            print('data inválida: use "AAAA-MM-DD HH:MM", +4h ou +2d', file=sys.stderr)
            return 2
        if ate <= de:
            print("o fim da janela precisa ser depois do início", file=sys.stderr)
            return 2
        d["janelas"].append({"id": a.estacao, "de": de.strftime(FMT), "ate": ate.strftime(FMT), "motivo": a.motivo})
        gravar(d)
        print("manutenção: %s de %s até %s" % (a.estacao, de.strftime(FMT), ate.strftime(FMT)))
        return 0
    abertas = [j for j in d["janelas"] if j["id"] == a.estacao and j["de"] <= agora.strftime(FMT) <= j["ate"]]
    if not abertas:
        print("%s não está em manutenção agora" % a.estacao)
        return 1
    fim = agora - timedelta(minutes=1)                 # o minuto atual já fica fora da janela
    for j in abertas:
        if datetime.strptime(j["de"], FMT) > fim:
            d["janelas"].remove(j)                         # começou agora mesmo: some
        else:
            j["ate"] = fim.strftime(FMT)
    gravar(d)
    print("manutenção encerrada: %s (%s)" % (a.estacao, agora.strftime(FMT)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
