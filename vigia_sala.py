#!/usr/bin/env python3
"""Vigia da Sala de Operações: roda a cada 5 min (LaunchAgent ai.hermes.sala-vigia), sem LLM e sem navegador.

1. Histórico próprio dos jobs. O executions.db do Hermes guarda só as últimas ~1000 execuções (uns 2 dias com jobs de 5 em
   5 min). O vigia copia as execuções terminadas que trabalharam (> 5 s) ou falharam para
   ~/.hermes/data/sala_historico_cron.jsonl (só id e nome do job, estado, início e fim; guarda 100 dias). É o que dá à Sala os
   períodos de 15 a 90 dias para os jobs. Jobs ocultos da Sala (apoio dela própria e avulso-*) ficam de fora.
2. Alerta por e-mail (opcional: chave "alerta_email" do sala_config.json; sem ela, só o histórico). Compara o estado da Sala
   com o da rodada anterior e manda UM e-mail por rodada quando há novidade: falha nova, agente sem ação, rotina atrasada,
   fonte de dados com problema e, para fechar o ciclo, o que voltou ao normal. Estação em manutenção não alerta. A 1ª
   rodada só grava a base (ligar o vigia não dispara e-mail pelos problemas antigos). Só metadados (nome, estado, hora):
   nunca a resposta de um agente. Um destinatário só. Envio pelo himalaya (conta do config). Se o envio falhar, a base não
   avança (a rodada seguinte tenta de novo) e o vigia sai com código 1.
   No máximo um aviso de problema por estação a cada 30 min (estação que oscila não vira uma enxurrada): o que acontecer
   dentro desse intervalo fica guardado e sai na primeira rodada depois dele. "Voltou ao normal" não espera.
3. Sinal de vida: ~/.hermes/data/sala_vigia.json (rodou_em, erro). A Sala acusa "fonte com problema" se o vigia ficar mais
   de 15 min sem rodar ou se a última rodada deu erro.

Uso: python3 vigia_sala.py            (silencioso quando não há novidade)
     python3 vigia_sala.py --teste    (manda um e-mail de teste pela conta configurada e sai)
Arquivos de teste: SALA_HIST_CRON, SALA_ALERTA_BASE, SALA_CONFIG, SALA_AGENTES, SALA_JOBS, SALA_MANUT (os mesmos do server.py).
Sala de Operações watcher: keeps a 100-day job history (the Hermes database keeps ~2 days) and e-mails state changes.
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from datetime import datetime
from email.message import EmailMessage

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import server  # noqa: E402  (a mesma leitura do painel)

BASE = os.environ.get("SALA_ALERTA_BASE") or os.path.join(server.HERMES, "data", "sala_alerta_base.json")
INTERVALO_AVISO_S = 1800      # um aviso de problema por estação a cada 30 min, no máximo
GUARDA_DIAS = 100
ENDERECO_SALA = "http://127.0.0.1:8765"


def gravar_atomico(caminho, texto):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    tmp = caminho + ".tmp"
    with open(tmp, "w", encoding="utf8") as f:
        f.write(texto)
    os.replace(tmp, caminho)


# ---------------------------------------------------------------- 1. histórico próprio dos jobs
def coletar_historico():
    """Acrescenta ao histórico da Sala as execuções novas do executions.db; descarta as com mais de GUARDA_DIAS. Devolve quantas entraram."""
    if not os.path.exists(server.EXEC_DB):
        return 0
    try:
        j = server.ler_json(server.JOBS)
        jobs = j["jobs"] if isinstance(j, dict) and "jobs" in j else j
    except Exception:
        jobs = []
    nomes = {x["id"]: x.get("name") or x["id"] for x in jobs}
    con = sqlite3.connect("file:%s?mode=rw" % server.EXEC_DB, uri=True, timeout=5)   # WAL: mode=rw + query_only (como no server.py)
    con.execute("PRAGMA query_only=ON")
    linhas_db = con.execute("select job_id, status, started_at, finished_at from executions "
                            "where status not in ('running', 'claimed') and started_at is not null").fetchall()
    con.close()
    guardadas, chaves = [], set()
    try:
        with open(server.HIST_CRON, encoding="utf8") as f:
            for l in f:
                try:
                    d = json.loads(l)
                    guardadas.append(d)
                    chaves.add((d["job_id"], d["started_at"]))
                except Exception:
                    continue
    except FileNotFoundError:
        pass
    novos = []
    for jid, st, ini, fim in linhas_db:
        nome = nomes.get(jid, "")
        if (jid, ini) in chaves or nome in server.JOBS_OCULTOS or nome.startswith("avulso-"):
            continue
        e = {"job_id": jid, "job": nome, "status": st, "started_at": ini, "finished_at": fim}
        if st == "failed" or server.dur(e) > 5:
            novos.append(e)
            chaves.add((jid, ini))
    corte = time.time() - GUARDA_DIAS * 86400
    manter = [d for d in guardadas if (server.iso_epoch(d.get("started_at")) or 0) >= corte]
    if novos or len(manter) != len(guardadas):
        todas = sorted(manter + novos, key=lambda d: d["started_at"])
        gravar_atomico(server.HIST_CRON, "".join(json.dumps(d, ensure_ascii=False) + "\n" for d in todas))
    return len(novos)


# ---------------------------------------------------------------- 2. alerta por e-mail
def config_email():
    try:
        cfg = server.ler_json(server.CONFIG)
    except FileNotFoundError:
        return None
    e = cfg.get("alerta_email") if isinstance(cfg, dict) else None
    if not e:
        return None
    para = (e.get("para") or "").strip()
    if not para or any(c in para for c in ",; "):
        raise SystemExit("alerta_email.para precisa ser UM endereço de e-mail (%s)" % server.CONFIG)
    return {"para": para, "de": e.get("de") or para, "conta": e.get("conta_himalaya"),
            "himalaya": e.get("himalaya") or shutil.which("himalaya") or "/opt/homebrew/bin/himalaya"}


def foto(s):
    """Retrato do que importa para o alerta (mesmos critérios do som da página)."""
    it = {}
    for x in s["agents"] + s["crons"]:
        cron = x["kind"] == "cron"
        it[x["id"]] = {
            "st": x["status"],
            "err": x.get("failed_today" if cron else "errors_today") or 0,
            "stuck": (not cron) and x["status"] == "running" and (x.get("sem_acao_s") or 0) >= server.SEM_ACAO_S,
            "late": bool(x.get("atrasado_s")) and x["status"] not in ("error", "running"),
            "nome": x.get("titulo") or x["id"],
            "ult": (x.get("last_run") or "")[:16].replace("T", " ") if cron else ((x.get("last") or {}).get("ts") or "")[:16],
            "atrasado_s": x.get("atrasado_s"),
            "sem_acao_s": x.get("sem_acao_s"),
        }
    return {"it": it, "saude": {f["fonte"]: f["msg"] for f in s.get("saude") or []}}


def eventos(a, b):
    """a = retrato anterior, b = atual -> [(tipo, id)]; tipo: falha | sem_acao | atrasado | fonte | volta."""
    ev = []
    for i, c in b["it"].items():
        p = a["it"].get(i)
        c["bad"] = c["st"] == "error" or (bool(p) and bool(p.get("bad")) and c["st"] != "ok")
        if not p or c["st"] == "manut":                  # estação nova (sem base) ou em manutenção: não alerta
            continue
        if (c["st"] == "error" and p["st"] != "error") or c["err"] > p["err"]:
            ev.append(("falha", i))
        elif c["stuck"] and not p["stuck"]:
            ev.append(("sem_acao", i))
        elif c["late"] and not p["late"]:
            ev.append(("atrasado", i))
        elif (p.get("bad") and c["st"] == "ok") or (p["late"] and not c["late"] and c["st"] != "error") \
                or (p["stuck"] and not c["stuck"] and c["st"] != "error"):
            ev.append(("volta", i))
    for f in b["saude"]:
        if f not in a["saude"] and f != "vigia":       # o próprio vigia está rodando: o aviso dele é só para a página
            ev.append(("fonte", f))
    return ev


def fmt_atraso(s):
    s = int(s or 0)
    return "%d min" % max(1, s // 60) if s < 3600 else ("%dh%02d" % (s // 3600, s % 3600 // 60) if s < 86400 else "%d dia(s)" % (s // 86400))


def mensagem(ev, b):
    titulos = {"falha": "FALHA", "sem_acao": "SEM AÇÃO", "atrasado": "ATRASADO", "fonte": "FONTE DE DADOS COM PROBLEMA",
               "volta": "VOLTOU AO NORMAL"}
    linhas = ["Sala de Operações · %s" % datetime.now().strftime("%d/%m/%Y %H:%M"), ""]
    for tipo in ("falha", "sem_acao", "atrasado", "fonte", "volta"):
        do_tipo = [i for t, i in ev if t == tipo]
        if not do_tipo:
            continue
        linhas.append(titulos[tipo])
        for i in do_tipo:
            if tipo == "fonte":
                linhas.append("  - %s" % b["saude"][i])
                continue
            c = b["it"][i]
            det = {"falha": "falhou%s" % (" · última execução " + c["ult"] if c["ult"] else ""),
                   "sem_acao": "rodando há %s sem nenhuma ação nova (ferramenta demorando ou travado)" % fmt_atraso(c["sem_acao_s"]),
                   "atrasado": "deveria ter rodado há %s" % fmt_atraso(c["atrasado_s"]),
                   "volta": "em ordem de novo"}[tipo]
            linhas.append("  - %s (%s): %s" % (c["nome"], i, det))
        linhas.append("")
    linhas += ["Abra a Sala neste Mac: %s" % ENDERECO_SALA,
               "Alerta automático do vigia da Sala (sem LLM). Estações em manutenção não geram alerta."]
    tipos = [t for t, _ in ev]
    grave = "FALHA" if "falha" in tipos else ("ATENÇÃO" if set(tipos) - {"volta"} else "Normalizado")
    alvo = [i for t, i in ev if (t != "volta") == (grave != "Normalizado")]
    nome = (b["saude"][alvo[0]][:60] if alvo[0] in b["saude"] else b["it"][alvo[0]]["nome"]) if len(alvo) == 1 else "%d estações" % len(alvo)
    return "[Sala] %s: %s" % (grave, nome), "\n".join(linhas) + "\n"


def enviar(cfg, assunto, corpo):
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = cfg["de"], cfg["para"], assunto
    m.set_content(corpo)
    cmd = [cfg["himalaya"]] + (["--account", cfg["conta"]] if cfg["conta"] else []) + ["message", "send"]
    try:
        r = subprocess.run(cmd, input=m.as_bytes(), capture_output=True, timeout=120)
    except Exception as e:
        return False, str(e)
    return r.returncode == 0, (r.stderr or r.stdout).decode("utf8", "ignore").strip()[:300]


def sinal_de_vida(erro=None):
    try:
        gravar_atomico(server.VIGIA, json.dumps({"rodou_em": time.time(), "erro": erro}, ensure_ascii=False))
    except Exception as e:
        print("sinal de vida: não gravou (%s)" % e)


def separar(ev, a, b, agora):
    """Aplica o limite de 1 aviso de problema por estação a cada 30 min. Devolve (eventos a enviar, retrato a gravar):
    a estação adiada fica com o retrato antigo, para a novidade aparecer de novo quando o intervalo passar."""
    avisado = dict(a.get("avisado") or {})
    enviar_ev, adiados = [], []
    for t, i in ev:
        chave = "saude:" + i if t == "fonte" else i
        if t != "volta" and agora - avisado.get(chave, 0) < INTERVALO_AVISO_S:
            adiados.append((t, i))
            continue
        enviar_ev.append((t, i))
    gravar = json.loads(json.dumps(b))
    for t, i in adiados:
        if t == "fonte":
            gravar["saude"].pop(i, None)
        elif i in a["it"]:
            gravar["it"][i] = a["it"][i]
    gravar["avisado"] = avisado
    return enviar_ev, gravar


def main(argv=()):
    if "--teste" in argv:
        cfg = config_email()
        if not cfg:
            print("sem a chave alerta_email em %s: nada a testar" % server.CONFIG)
            return 2
        ok, msg = enviar(cfg, "[Sala] Teste do aviso por e-mail",
                         "Teste do vigia da Sala de Operações (%s).\nSe chegou, o aviso por e-mail está funcionando.\n" % datetime.now().strftime("%d/%m/%Y %H:%M"))
        print("e-mail de teste enviado para %s" % cfg["para"] if ok else "o e-mail de teste NÃO saiu (%s)" % msg)
        return 0 if ok else 1
    codigo = 0
    sinal_de_vida()
    try:
        n = coletar_historico()
        if n:
            print("%s histórico: +%d execução(ões) de job" % (datetime.now().strftime("%Y-%m-%d %H:%M"), n))
    except Exception as e:
        print("histórico dos jobs: falhou (%s)" % e)
        sinal_de_vida("o histórico dos jobs não foi gravado (%s)" % e)
        codigo = 1
    cfg = config_email()
    if not cfg:
        return codigo
    del server.SAUDE[:]
    b = foto(server.estado(7))
    try:
        a = server.ler_json(BASE)
    except FileNotFoundError:
        a = None
    except Exception:
        a = None
    if not a:
        eventos({"it": {}, "saude": {}}, b)              # só marca o \"em falha\" de cada um
        gravar_atomico(BASE, json.dumps(b, ensure_ascii=False))
        print("alerta: base inicial gravada (nenhum e-mail na primeira rodada)")
        return codigo
    agora = time.time()
    ev, gravar = separar(eventos(a, b), a, b, agora)
    if ev:
        assunto, corpo = mensagem(ev, b)
        ok, msg = enviar(cfg, assunto, corpo)
        if not ok:
            print("alerta: o e-mail NÃO saiu (%s); tento de novo na próxima rodada" % msg)
            sinal_de_vida("o último e-mail de aviso não saiu (%s)" % msg[:120])
            return 1
        for t, i in ev:
            if t != "volta":
                gravar["avisado"]["saude:" + i if t == "fonte" else i] = agora
        print("%s alerta enviado: %s" % (datetime.now().strftime("%Y-%m-%d %H:%M"), assunto))
    gravar_atomico(BASE, json.dumps(gravar, ensure_ascii=False))
    return codigo


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
