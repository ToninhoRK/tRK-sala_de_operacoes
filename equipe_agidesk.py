#!/usr/bin/env python3
"""Números da equipe Governança de TI no Agidesk para a sala GOVERNANÇA da Sala de Operações.

SOMENTE LEITURA (GET) no Agidesk. Sem modelo de I.A. Grava só ~/.hermes/data/equipe_agidesk.json, com TOTAIS DA EQUIPE:
  chamados em aberto, quantos estão sem responsável e encerrados HOJE pela equipe.
NADA POR PESSOA (decisão de 15/10/2026: número individual exposto num painel pode constranger colaborador):
sem lista de membros, sem nome, sem contagem por responsável. Nada de título, descrição ou solicitante de chamado.

- Em aberto: datasets/serviceissues, team=<equipe_id>, status = todos os "em aberto" (convenção do setor: tudo que não é Encerrada/Cancelada),
  campos id,responsible_id (o responsável só é lido para contar os SEM responsável; não é gravado); per_page=1000 (pagina se passar de 1000).
- Encerrados hoje: datasets/serviceissues, team=<equipe_id>, status=3, sorting=-finished_at, campos id,finished_at;
  conta os de finished_at com a data de hoje (pagina enquanto a página vier toda de hoje).
- A chave do Agidesk vem do Keychain (conta e serviço em sala_config.py), só em memória; nunca impressa nem gravada.
- Se qualquer leitura falhar, NÃO sobrescreve os números (o arquivo fica como estava e a Sala mostra "lido há X min", cinza se passar de 15 min);
  imprime o erro e sai com código 1 (o job aparece como falha em `hermes cron list`).
- A mesma URL de dataset não pode repetir em menos de 5 s (HTTP 429): pausa de 6 s entre páginas e nova tentativa no 429.
"""
import os, sys, json, time, subprocess, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sala_config
from datetime import datetime

HOME = os.path.expanduser("~")
DEST = os.path.join(HOME, ".hermes/data/equipe_agidesk.json")
BASE = sala_config.obter("agidesk_url")
EQUIPE = str(sala_config.obter("equipe_id"))
ABERTOS = ",".join(str(x) for x in (1, 2, 5, 6, 8, 9, 10, 11, *range(200, 210)))
PAUSA_S = 6
KEY = None


def chave():
    global KEY
    if KEY is None:
        r = subprocess.run(["security", "find-generic-password", "-a", sala_config.obter("agidesk_keychain_account"), "-s", sala_config.obter("agidesk_keychain_service"), "-w"],
                           capture_output=True, text=True)
        KEY = r.stdout.strip()
        if not KEY:
            raise RuntimeError("chave do Agidesk não encontrada no Keychain")
    return KEY


def get(caminho, tentativas=4):
    url = BASE + caminho + ("&" if "?" in caminho else "?") + "app_key=" + chave()
    ultimo = ""
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            ultimo = f"HTTP {e.code}"
            if e.code == 429:
                time.sleep(PAUSA_S + 1)
                continue
            break
        except Exception as e:
            ultimo = type(e).__name__
            time.sleep(2)
    raise RuntimeError(f"falha ao ler {caminho.split('?')[0]}: {ultimo}")


def linhas(d):
    if isinstance(d, dict) and "data" in d:
        d = d["data"]
    if isinstance(d, dict):
        d = list(d.values())
    return [x for x in (d or []) if isinstance(x, dict)]


def contar_abertos():
    sem, total, pg = 0, 0, 1
    while True:
        d = get(f"datasets/serviceissues?metadata&forecast=teams&per_page=1000&page={pg}&team={EQUIPE}&status={ABERTOS}&fields=id,responsible_id")
        L = linhas(d)
        for r in L:
            total += 1
            if not r.get("responsible_id"):
                sem += 1
        if len(L) < 1000 or pg >= 10:
            break
        pg += 1
        time.sleep(PAUSA_S)
    return sem, total


def contar_encerrados_hoje():
    hoje = datetime.now().strftime("%Y-%m-%d")
    n, pg = 0, 1
    while True:
        d = get(f"datasets/serviceissues?metadata&forecast=teams&per_page=200&page={pg}&team={EQUIPE}&status=3&sorting=-finished_at&fields=id,finished_at")
        L = linhas(d)
        hj = [r for r in L if str(r.get("finished_at") or "").startswith(hoje)]
        n += len(hj)
        if len(hj) < 200 or len(L) < 200 or pg >= 5:   # a lista vem do mais recente para o mais antigo: parou de ser "hoje", acabou
            break
        pg += 1
        time.sleep(PAUSA_S)
    return n


def main():
    try:
        sem, total = contar_abertos()
        time.sleep(PAUSA_S)
        enc = contar_encerrados_hoje()
    except Exception as e:
        print("ERRO: " + str(e)); return 1
    out = {"updated_at": time.time(), "dia": datetime.now().strftime("%Y-%m-%d"),
           "abertos_total": total, "sem_responsavel": sem, "encerrados_hoje_total": enc}
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    tmp = DEST + ".tmp"
    json.dump(out, open(tmp, "w", encoding="utf8"), ensure_ascii=False)
    os.replace(tmp, DEST)
    return 0


if __name__ == "__main__":
    sys.exit(main())
