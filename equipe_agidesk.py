#!/usr/bin/env python3
"""Números da equipe Governança de TI no Agidesk para a sala GOVERNANÇA da Sala de Operações.

SOMENTE LEITURA (GET) no Agidesk. Sem modelo de I.A. Grava só ~/.hermes/data/equipe_agidesk.json, com TOTAIS DA EQUIPE:
  chamados em aberto, quantos estão sem responsável, quantos estão vencidos (prazo passou), encerrados HOJE e nos últimos 7 dias
  e o tempo de atendimento (abertura -> encerramento) dos encerrados em 7 dias, médio e mediano.
NADA POR PESSOA (decisão de 15/10/2026: número individual exposto num painel pode constranger colaborador):
sem lista de membros, sem nome, sem contagem por responsável. Nada de título, descrição ou solicitante de chamado.

- Em aberto: datasets/serviceissues, team=<equipe_id>, status = todos os "em aberto" (convenção do setor: tudo que não é Encerrada/Cancelada),
  campos id,responsible_id,duedate (o responsável só é lido para contar os SEM responsável; não é gravado; vencido = duedate preenchido
  e já passado); per_page=1000 (pagina se passar de 1000).
- Encerrados: datasets/serviceissues, team=<equipe_id>, status=3, sorting=-finished_at, campos id,created_at,finished_at;
  pagina enquanto a página vier toda dos últimos 7 dias (no máximo 5 páginas de 200).
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
DEST = os.environ.get("SALA_EQUIPE_DEST") or os.path.join(HOME, ".hermes/data/equipe_agidesk.json")   # SALA_EQUIPE_DEST: teste sem tocar no arquivo da Sala
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


def data(s):
    """'2026-10-15 14:03:00' (ou ISO) -> datetime; None se vazio ou ilegível."""
    s = str(s or "").strip().replace("T", " ")[:19]
    if not s or s.startswith("0000"):
        return None
    for f in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:len(datetime.now().strftime(f))], f)
        except ValueError:
            pass
    return None


def contar_abertos():
    sem, total, venc, pg = 0, 0, 0, 1
    agora = datetime.now()
    while True:
        d = get(f"datasets/serviceissues?metadata&forecast=teams&per_page=1000&page={pg}&team={EQUIPE}&status={ABERTOS}&fields=id,responsible_id,duedate")
        L = linhas(d)
        for r in L:
            total += 1
            if not r.get("responsible_id"):
                sem += 1
            p = data(r.get("duedate"))
            if p and p < agora:
                venc += 1
        if len(L) < 1000 or pg >= 10:
            break
        pg += 1
        time.sleep(PAUSA_S)
    return sem, total, venc


def encerrados():
    """(encerrados hoje, encerrados em 7 dias, horas de atendimento de cada encerrado em 7 dias). Só datas, nada do conteúdo."""
    agora = datetime.now()
    hoje, corte = agora.strftime("%Y-%m-%d"), agora.timestamp() - 7 * 86400
    n_hoje, n7, horas, pg = 0, 0, [], 1
    while True:
        d = get(f"datasets/serviceissues?metadata&forecast=teams&per_page=200&page={pg}&team={EQUIPE}&status=3&sorting=-finished_at&fields=id,created_at,finished_at")
        L = linhas(d)
        recentes = 0
        for r in L:
            fim, ini = data(r.get("finished_at")), data(r.get("created_at"))
            if not fim or fim.timestamp() < corte:
                continue
            recentes += 1
            n7 += 1
            n_hoje += fim.strftime("%Y-%m-%d") == hoje
            if ini and fim >= ini:
                horas.append((fim - ini).total_seconds() / 3600)
        if recentes < len(L) or len(L) < 200 or pg >= 5:   # a lista vem do mais recente para o mais antigo: passou de 7 dias, acabou
            break
        pg += 1
        time.sleep(PAUSA_S)
    return n_hoje, n7, horas


def main():
    try:
        sem, total, venc = contar_abertos()
        time.sleep(PAUSA_S)
        enc, enc7, horas = encerrados()
    except Exception as e:
        print("ERRO: " + str(e)); return 1
    horas.sort()
    out = {"updated_at": time.time(), "dia": datetime.now().strftime("%Y-%m-%d"),
           "abertos_total": total, "sem_responsavel": sem, "vencidos": venc, "encerrados_hoje_total": enc, "encerrados_7d": enc7,
           "atendimento_medio_h_7d": round(sum(horas) / len(horas), 1) if horas else None,
           "atendimento_mediano_h_7d": round(horas[len(horas) // 2], 1) if horas else None}
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    tmp = DEST + ".tmp"
    json.dump(out, open(tmp, "w", encoding="utf8"), ensure_ascii=False)
    os.replace(tmp, DEST)
    return 0


if __name__ == "__main__":
    sys.exit(main())
