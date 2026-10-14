#!/usr/bin/env python3
"""Números da equipe Governança de TI no Agidesk para a sala GOVERNANÇA da Sala de Operações.

SOMENTE LEITURA (GET) no Agidesk. Sem modelo de I.A. Grava só ~/.hermes/data/equipe_agidesk.json:
  membros (id, nome), chamados em aberto por responsável, encerrados HOJE por responsável e quantos estão sem responsável.
Nada de título, descrição ou solicitante de chamado.

- Membros: GET /agents (550 agentes, paginado, ~6 chamadas) filtrados pela equipe configurada (equipe_id) e ativos; refeito no máximo a cada 1 h
  (se falhar, mantém a lista anterior). Pessoa nova na equipe ganha mesa na próxima leitura.
- Em aberto: datasets/serviceissues, team=<equipe_id>, status = todos os "em aberto" (convenção do setor: tudo que não é Encerrada/Cancelada),
  campos id,responsible_id; per_page=1000 (pagina se passar de 1000). Contagem por responsible_id.
- Encerrados hoje: datasets/serviceissues, team=<equipe_id>, status=3, sorting=-finished_at, campos id,responsible_id,finished_at;
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
MEMBROS_VALIDADE_S = 3600
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


def ler_membros():
    ag, pg = [], 1
    while True:
        L = linhas(get(f"agents?per_page=100&page={pg}&fields=id,fullname,teams,status_id,active"))
        ag += L
        if len(L) < 100 or pg >= 30:
            break
        pg += 1
        time.sleep(2)
    out = []
    for a in ag:
        if EQUIPE in (a.get("teams") or {}) and str(a.get("active", "1")) == "1":
            out.append({"id": str(a["id"]), "nome": (a.get("fullname") or "").strip()})
    if not out:
        raise RuntimeError("nenhum membro encontrado na equipe (lista vazia): mantendo a anterior")
    return sorted(out, key=lambda m: m["nome"])


def contar_abertos():
    por, sem, total, pg = {}, 0, 0, 1
    while True:
        d = get(f"datasets/serviceissues?metadata&forecast=teams&per_page=1000&page={pg}&team={EQUIPE}&status={ABERTOS}&fields=id,responsible_id")
        L = linhas(d)
        for r in L:
            total += 1
            rid = str(r.get("responsible_id") or "")
            if rid:
                por[rid] = por.get(rid, 0) + 1
            else:
                sem += 1
        if len(L) < 1000 or pg >= 10:
            break
        pg += 1
        time.sleep(PAUSA_S)
    return por, sem, total


def contar_encerrados_hoje():
    hoje = datetime.now().strftime("%Y-%m-%d")
    por, pg = {}, 1
    while True:
        d = get(f"datasets/serviceissues?metadata&forecast=teams&per_page=200&page={pg}&team={EQUIPE}&status=3&sorting=-finished_at&fields=id,responsible_id,finished_at")
        L = linhas(d)
        hj = [r for r in L if str(r.get("finished_at") or "").startswith(hoje)]
        for r in hj:
            rid = str(r.get("responsible_id") or "")
            por[rid] = por.get(rid, 0) + 1
        if len(hj) < 200 or len(L) < 200 or pg >= 5:   # a lista vem do mais recente para o mais antigo: parou de ser "hoje", acabou
            break
        pg += 1
        time.sleep(PAUSA_S)
    return por


def main():
    try:
        antigo = json.load(open(DEST, encoding="utf8"))
    except Exception:
        antigo = {}
    agora = time.time()
    membros, membros_em = antigo.get("membros"), antigo.get("membros_em") or 0
    erros = []
    if not membros or agora - membros_em > MEMBROS_VALIDADE_S:
        try:
            membros, membros_em = ler_membros(), agora
        except Exception as e:
            erros.append(str(e))
            if not membros:
                print("ERRO: " + "; ".join(erros)); return 1
        time.sleep(1)
    try:
        abertos, sem, total = contar_abertos()
        time.sleep(PAUSA_S)
        enc = contar_encerrados_hoje()
    except Exception as e:
        print("ERRO: " + str(e)); return 1
    ids = {m["id"] for m in membros}
    out = {
        "updated_at": agora, "dia": datetime.now().strftime("%Y-%m-%d"),
        "membros": membros, "membros_em": membros_em,
        "abertos": {m["id"]: abertos.get(m["id"], 0) for m in membros},
        "encerrados_hoje": {m["id"]: enc.get(m["id"], 0) for m in membros},
        "sem_responsavel": sem, "abertos_total": total,
        "outros_abertos": sum(n for k, n in abertos.items() if k not in ids),   # abertos da equipe com responsável que não é membro
    }
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    tmp = DEST + ".tmp"
    json.dump(out, open(tmp, "w", encoding="utf8"), ensure_ascii=False)
    os.replace(tmp, DEST)
    if erros:
        print("AVISO (lista de membros mantida): " + "; ".join(erros))
    return 0


if __name__ == "__main__":
    sys.exit(main())
