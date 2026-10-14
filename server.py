#!/usr/bin/env python3
"""Sala de Operações de Agentes (Governança de TI) — servidor local, SOMENTE LEITURA.

Lê o que já existe (nada em produção é alterado):
  - ~/.hermes/scripts/agentes.json            -> catálogo de agentes (modelo, descrição)
  - ~/.hermes/data/agentes/*.log              -> histórico de execuções (cabeçalho de cada rodada)
  - ~/.hermes/cron/jobs.json + executions.db  -> jobs agendados e suas execuções
  - ps                                        -> agente rodando AGORA (processo rodar_agente.py <agente>)

Expõe só metadados (agente, hora, modelo, código de saída). O conteúdo das respostas dos agentes
(orçamento, RH etc.) NUNCA é lido nem enviado ao navegador.

Uso: python3 server.py [porta]      (escuta apenas em 127.0.0.1; padrão 8765)
"""
import os, re, sys, json, time, sqlite3, subprocess
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

AQUI = os.path.dirname(os.path.abspath(__file__))
HERMES = os.path.expanduser("~/.hermes")
AGENTES = os.path.join(HERMES, "scripts", "agentes.json")
LOGS = os.path.join(HERMES, "data", "agentes")
JOBS = os.path.join(HERMES, "cron", "jobs.json")
EXEC_DB = os.path.join(HERMES, "cron", "executions.db")
STATE_DB = os.path.join(HERMES, "state.db")

# Sem Hermes neste computador (ex.: um colega que só quer ver o painel), usa os dados de exemplo da pasta exemplo/:
# o painel abre com os agentes e jobs do setor, sem histórico de execuções (use ?demo=1 para simular estados).
EXEMPLO = os.path.join(AQUI, "exemplo")
if not os.path.exists(AGENTES):
    AGENTES = os.path.join(EXEMPLO, "agentes.json")
if not os.path.exists(JOBS):
    JOBS = os.path.join(EXEMPLO, "cron_jobs.json")

# Layout da planta: gerado a partir de layout.json (setores) + agentes.json. Nada de agente novo fica de fora:
# quem não casa com nenhum setor vai para a sala padrão ("NOVOS AGENTES").
LAYOUT_JSON = os.path.join(AQUI, "layout.json")
LARG = 4.2          # largura de uma coluna de estações (unidades da planta)
PASSO2 = 5.6        # passo entre fileiras quando a sala tem 2+ fileiras
PASSO1 = 3.4        # idem, sala de 1 fileira
TOPO = 2.4          # faixa da parede dos fundos (placa) antes da 1ª fileira
GAP = 0.8           # espaço entre salas na mesma linha
CORREDOR = 1.6      # corredor entre a linha de cima e a de baixo


def carregar_layout():
    try:
        return json.load(open(LAYOUT_JSON, encoding="utf8"))
    except Exception:
        return {"setores": [], "padrao": {"id": "novos", "titulo": "NOVOS AGENTES", "linha": "baixo"}, "fluxos": []}


def montar_layout(cat, cron_ids, equipe_ids=()):
    """Devolve (layout, origem) onde origem[id] = (setor, motivo). equipe_ids = pessoas da equipe (uma mesa cada) na sala tipo "equipe"."""
    cfg = carregar_layout()
    setores = {z["id"]: dict(z, itens=[]) for z in cfg.get("setores", [])}
    padrao = cfg.get("padrao") or {"id": "novos", "titulo": "NOVOS AGENTES", "linha": "baixo"}
    origem = {}
    pref = sorted(((p, z["id"]) for z in cfg.get("setores", []) for p in z.get("prefixos", [])), key=lambda t: -len(t[0]))
    explicito = {a: z["id"] for z in cfg.get("setores", []) for a in z.get("agentes", [])}
    ordem_explicita = {z["id"]: z.get("agentes", []) for z in cfg.get("setores", [])}

    def destino(nome, a):
        if a.get("setor") in setores:
            return a["setor"], "campo setor"
        if nome in explicito:
            return explicito[nome], "layout.json"
        for p, zid in pref:
            if nome.startswith(p):
                return zid, "prefixo " + p
        return padrao["id"], "padrão (sem setor definido)"

    for nome, a in cat.items():
        zid, motivo = destino(nome, a)
        if zid not in setores:
            setores[zid] = dict(padrao, itens=[])
        setores[zid]["itens"].append(nome)
        origem[nome] = (zid, motivo)
    cron_zid = next((z["id"] for z in cfg.get("setores", []) if z.get("tipo") == "cron"), None)
    for cid in cron_ids:
        if cron_zid:
            setores[cron_zid]["itens"].append(cid)
            origem[cid] = (cron_zid, "cron")
    for z in cfg.get("setores", []):     # sala do Jarvis (Hermes principal): uma estação fixa
        if z.get("tipo") == "jarvis":
            setores[z["id"]]["itens"] = ["jarvis"]
            origem["jarvis"] = (z["id"], "jarvis")
        if z.get("tipo") == "equipe":    # sala da equipe (Agidesk): uma mesa por pessoa, lida de equipe_agidesk.json; sem dados, a sala não aparece
            setores[z["id"]]["itens"] = list(equipe_ids)
            for pid in equipe_ids:
                origem[pid] = (z["id"], "equipe")
    for zid, z in setores.items():       # agentes listados explicitamente mantêm a ordem do layout.json
        ex = [i for i in ordem_explicita.get(zid, []) if i in z["itens"]]
        z["itens"] = ex + [i for i in z["itens"] if i not in ex]

    def dims(z):
        n = len(z["itens"])
        cols = 1 if n <= 1 else (2 if n <= 4 else 3)
        if z.get("tipo") == "equipe":            # no máximo 3 mesas por coluna: a sala tem a mesma profundidade das salas vizinhas (3 fileiras)
            cols = max(1, -(-n // 3))
        rows = max(1, -(-n // cols))
        passo = PASSO2 if rows > 1 else PASSO1
        return cols, rows, cols * LARG, TOPO + rows * passo

    zonas, linhas = [], {"cima": [], "baixo": []}
    for z in setores.values():
        if z.get("tipo") == "reuniao":
            linhas.setdefault(z.get("linha", "cima"), []).append(z)
        elif z["itens"]:
            linhas.setdefault(z.get("linha", "baixo"), []).append(z)
    ordem = ("cima", "baixo")
    plano, larg_max = {}, 0.0
    for nome_linha in ordem:                         # 1ª passada: medidas de cada linha de salas
        zs = linhas.get(nome_linha, [])
        if not zs:
            continue
        zs.sort(key=lambda z: z.get("tipo") == "reuniao")   # sala de reunião sempre no fim da linha
        d = [dims(z) if z.get("tipo") != "reuniao" else (1, 1, z.get("largura", LARG), 0) for z in zs]   # "largura" no layout.json: a sala de reunião não encolhe quando a linha já é a mais larga
        prof = max([t[3] for z, t in zip(zs, d) if z.get("tipo") != "reuniao"] or [TOPO + PASSO1])
        larg = sum(t[2] for t in d) + GAP * (len(d) - 1)
        plano[nome_linha] = (zs, d, prof, larg)
        larg_max = max(larg_max, larg)
    y = 0.0
    for nome_linha in ordem:                         # 2ª passada: posições
        if nome_linha not in plano:
            continue
        zs, d, prof, larg = plano[nome_linha]
        sobra = larg_max - larg                      # a sala de reunião absorve a sobra de largura da linha
        x = 0.0
        for z, (cols, rows, w, hn) in zip(zs, d):
            reuniao = z.get("tipo") == "reuniao"
            if reuniao:
                w += sobra
            # toda sala ocupa a profundidade da linha ("h"); "hn" é a altura natural das estações (a sobra vira área de convivência)
            zonas.append({"id": z["id"], "title": z["titulo"], "x": round(x, 2), "y": round(y, 2), "w": round(w, 2), "h": round(prof, 2),
                          "hn": None if reuniao else round(hn, 2), "cols": cols, "rows": rows,
                          "tipo": z.get("tipo", ""), "items": z["itens"]})
            x += w + GAP
        y += prof + CORREDOR
    prof_total = (y - CORREDOR) if zonas else 10

    flx = [f for f in cfg.get("fluxos", [])]
    return {"plant": {"w": round(larg_max, 2), "h": round(prof_total, 2)}, "zones": zonas, "flows": flx}, origem


HDR = re.compile(r"^===== (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) · \[Agente (\S+) · modelo: ([^\]·]+?)( · ATENÇÃO:[^\]]*)?\] · código (-?\d+)")
_cache_logs = {}  # caminho -> (mtime, size, [eventos])


def eventos_log(caminho):
    st = os.stat(caminho)
    chave = (st.st_mtime, st.st_size)
    c = _cache_logs.get(caminho)
    if c and c[0] == chave:
        return c[1]
    ev = []
    with open(caminho, encoding="utf8", errors="replace") as f:
        for linha in f:
            if linha.startswith("====="):
                m = HDR.match(linha)
                if m:
                    ev.append({"ts": m.group(1), "agent": m.group(2), "model": m.group(3).strip(),
                               "fallback": bool(m.group(4)), "code": int(m.group(5))})
    _cache_logs[caminho] = (chave, ev)
    return ev


def historico():
    todos, vistos = [], set()
    if os.path.isdir(LOGS):
        for n in os.listdir(LOGS):
            if n.endswith(".log"):
                for e in eventos_log(os.path.join(LOGS, n)):
                    k = (e["ts"], e["agent"], e["model"], e["code"])
                    if k not in vistos:
                        vistos.add(k)
                        todos.append(e)
    todos.sort(key=lambda e: e["ts"])
    return todos


def etime_s(s):
    """ps etime [[dd-]hh:]mm:ss -> segundos"""
    d = 0
    if "-" in s:
        d, s = s.split("-", 1)
    p = [int(x) for x in s.split(":")]
    while len(p) < 3:
        p.insert(0, 0)
    return int(d) * 86400 + p[0] * 3600 + p[1] * 60 + p[2]


def rodando_agora():
    """{agente: segundos_rodando} a partir dos processos 'rodar_agente.py <agente>'."""
    r = {}
    try:
        out = subprocess.run(["ps", "-axo", "pid=,etime=,command="], capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return r
    for linha in out.splitlines():
        m = re.match(r"\s*(\d+)\s+(\S+)\s+(.*)", linha)
        if not m:
            continue
        cmd = m.group(3)
        mm = re.search(r"rodar_agente\.py\s+([a-z0-9_]+)", cmd)
        if mm and "ps -axo" not in cmd and "grep" not in cmd:
            try:
                r[mm.group(1)] = max(r.get(mm.group(1), 0), etime_s(m.group(2)))
            except Exception:
                pass
    return r


def pid_vivo(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except Exception:
        return False


JOBS_OCULTOS = {"govti-vault-contagem", "govti-equipe-agidesk"}   # jobs de apoio da própria Sala (contagem da placa da Diretoria; números da sala GOVERNANÇA): rodam a cada 5 min e não aparecem nem no feed

def cron_dados():
    jobs = []
    try:
        j = json.load(open(JOBS, encoding="utf8"))
        jobs = j["jobs"] if isinstance(j, dict) and "jobs" in j else j
    except Exception:
        return []
    jobs = [x for x in jobs if x.get("name") not in JOBS_OCULTOS]
    execs = {}
    try:
        con = sqlite3.connect("file:%s?mode=ro" % EXEC_DB, uri=True, timeout=5)
        con.row_factory = sqlite3.Row
        for r in con.execute("select job_id,status,pid,started_at,finished_at,error from executions "
                             "order by claimed_at desc limit 400"):
            execs.setdefault(r["job_id"], []).append(dict(r))
        con.close()
    except Exception:
        pass
    saida = []
    hoje = datetime.now().strftime("%Y-%m-%d")
    for jb in jobs:
        ex = execs.get(jb["id"], [])
        rodando = next((e for e in ex if e["status"] in ("running", "claimed") and pid_vivo(e["pid"])), None)
        ultimo = ex[0] if ex else None
        sch = jb.get("schedule") or {}
        saida.append({
            "id": "cron:" + jb["name"], "kind": "cron", "name": jb["name"],
            "desc": "Job agendado: %s" % (sch.get("display") or sch.get("expr") or ""),
            "schedule": sch.get("display") or sch.get("expr"),
            "enabled": jb.get("enabled", True),
            "next_run": jb.get("next_run_at"), "last_run": jb.get("last_run_at"),
            "last_status": jb.get("last_status"),
            "running": bool(rodando),
            "checks_today": sum(1 for e in ex if (e.get("started_at") or "").startswith(hoje)),
            "failed_today": sum(1 for e in ex if (e.get("started_at") or "").startswith(hoje) and e["status"] == "failed"),
            "last_exec_status": ultimo["status"] if ultimo else None,
            "_execs": ex,
        })
    return saida


SESSAO_ATIVA_S = 90                       # conversa com mensagem nos últimos 90 s = Jarvis "atendendo"
FONTES_NAO_INTERATIVAS = ("oneshot", "cron", "subagent")   # execuções de agente/cron/subagente não são conversa


def jarvis_estado():
    """Jarvis = o Hermes principal (o modelo com quem o usuário conversa). Só metadados do state.db (somente leitura):
    origem, modelo e hora da última mensagem. NUNCA lê o conteúdo das mensagens."""
    base = {"id": "jarvis", "kind": "jarvis", "name": "Jarvis",
            "desc": "Hermes principal: o modelo com quem você conversa e que aciona os agentes. Atende você quando há conversa ativa e fica disponível quando não há.",
            "status": "ok", "model": None, "source": None, "last_activity": None, "active_sessions": 0}
    try:
        con = sqlite3.connect("file:%s?mode=ro" % STATE_DB, uri=True, timeout=3)
        marcas = ",".join("?" * len(FONTES_NAO_INTERATIVAS))
        rows = con.execute("select id, source, model, started_at from sessions where source not in (%s) "
                           "order by started_at desc limit 15" % marcas, FONTES_NAO_INTERATIVAS).fetchall()
        agora = time.time()
        melhor = None
        for sid, src, modelo, _ini in rows:
            r = con.execute("select max(timestamp) from messages where session_id=?", (sid,)).fetchone()
            ultima = r[0] if r and r[0] else None
            if base["model"] is None:
                base["model"], base["source"] = modelo, src       # sessão interativa mais recente
            if ultima and agora - ultima <= SESSAO_ATIVA_S:
                base["active_sessions"] += 1
                if melhor is None or ultima > melhor[0]:
                    melhor = (ultima, src, modelo)
            if ultima and (base["last_activity"] is None or ultima > base["last_activity"]):
                base["last_activity"] = ultima
        con.close()
        if melhor:
            base["status"], base["source"], base["model"] = "running", melhor[1], melhor[2]
        if base["last_activity"]:
            base["last_activity"] = datetime.fromtimestamp(base["last_activity"]).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        pass
    return base


def dur(e):
    try:
        a = datetime.fromisoformat(e["started_at"]); b = datetime.fromisoformat(e["finished_at"])
        return (b - a).total_seconds()
    except Exception:
        return 0


CLAUDE_USO = os.path.join(HERMES, "data", "claude_uso.json")   # gravado pelo statusLine do Claude Code (claude_statusline.py)

def claude_uso():
    """Uso da assinatura Claude (sessao 5 h e semana 7 d), so percentual e hora de reinicio. Somente leitura.
    So atualiza quando uma sessao do Claude Code responde: por isso vai junto a hora da leitura e se a janela ja reiniciou."""
    try:
        j = json.load(open(CLAUDE_USO, encoding="utf8"))
    except Exception:
        return None
    agora = time.time()
    out = {"updated_at": j.get("updated_at"), "age_s": int(agora - (j.get("updated_at") or agora))}
    for k in ("five_hour", "seven_day"):
        x = j.get(k)
        if isinstance(x, dict) and x.get("used_percentage") is not None:
            r = x.get("resets_at")
            out[k] = {"pct": round(float(x["used_percentage"]), 1), "resets_at": r, "reset_passou": bool(r and r < agora)}
    return out if ("five_hour" in out or "seven_day" in out) else None

VAULT_CONT = os.path.join(HERMES, "data", "vault_contagem.json")   # gravado por vault_contagem.py (LaunchAgent ai.hermes.vault-contagem)
EQUIPE_JSON = os.path.join(HERMES, "data", "equipe_agidesk.json")   # gravado por equipe_agidesk.py (job de cron oculto govti-equipe-agidesk, a cada 5 min)
EQUIPE_VELHO_S = 900


def equipe_painel():
    """Sala GOVERNANÇA: uma pessoa por mesa, com chamados em aberto e encerrados hoje (Agidesk, equipe 13). So nomes (primeiro nome) e numeros; somente leitura.
    Devolve (pessoas, resumo) ou ([], None) sem dados. Leitura com mais de 15 min fica 'idle' (cinza); encerrados de outro dia aparecem como None."""
    try:
        j = json.load(open(EQUIPE_JSON, encoding="utf8"))
        membros = j["membros"]
    except Exception:
        return [], None
    age = int(time.time() - (j.get("updated_at") or 0))
    velho = age > EQUIPE_VELHO_S
    hoje_ok = j.get("dia") == datetime.now().strftime("%Y-%m-%d")
    pessoas = []
    for m in membros:
        pid = str(m["id"])
        pessoas.append({"id": "pessoa:" + pid, "kind": "pessoa", "name": (m.get("nome") or pid).split()[0],
                        "status": "idle" if velho else "ok",
                        "abertos": (j.get("abertos") or {}).get(pid),
                        "encerrados": (j.get("encerrados_hoje") or {}).get(pid) if hoje_ok else None,
                        "desc": "Pessoa da equipe Governança de TI no Agidesk (números lidos a cada 5 min)."})
    resumo = {"sem_responsavel": j.get("sem_responsavel"), "abertos_total": j.get("abertos_total"), "age_s": age, "velho": velho}
    return pessoas, resumo

def vault_painel():
    """Placa da DIRETORIA: total de notas do vault, variação (hoje e semana) e resultado da última conferência da auditoria. So numeros; somente leitura."""
    try:
        j = json.load(open(VAULT_CONT, encoding="utf8"))
    except Exception:
        return None
    agora = time.time(); hoje = datetime.now().strftime("%Y-%m-%d"); total = j.get("total")
    hist = j.get("historico") or {}
    antes = sorted(d for d in hist if d < hoje)
    out = {"total": total, "age_s": int(agora - (j.get("updated_at") or agora)),
           "por_tipo": dict(sorted((j.get("por_tipo") or {}).items(), key=lambda x: -x[1])[:6]),
           "delta_hoje": (total - hist[antes[-1]]) if (antes and total is not None) else None,
           "delta_semana": None, "dias_semana": None, "auditoria": None}
    if antes and total is not None:
        alvo = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        ate = [d for d in antes if d <= alvo]
        base = ate[-1] if ate else antes[0]
        out["delta_semana"] = total - hist[base]
        out["dias_semana"] = (datetime.now().date() - datetime.strptime(base, "%Y-%m-%d").date()).days
    a = j.get("auditoria")
    if isinstance(a, dict) and a.get("divergencias") is not None:
        out["auditoria"] = {"divergencias": a["divergencias"], "age_s": int(agora - (a.get("checado_em") or agora)), "categorias": a.get("categorias") or {}}
    return out

def estado():
    agora = datetime.now()
    hoje = agora.strftime("%Y-%m-%d")
    cat = json.load(open(AGENTES, encoding="utf8"))
    hist = historico()
    rod = rodando_agora()
    por = {}
    for e in hist:
        por.setdefault(e["agent"], []).append(e)
    agentes = []
    for nome, a in cat.items():
        h = por.get(nome, [])
        ult = h[-1] if h else None
        if nome in rod:
            st = "running"
        elif ult and ult["code"] != 0:
            st = "error"
        elif ult:
            st = "ok"
        else:
            st = "idle"
        agentes.append({
            "id": nome, "kind": "agent", "name": nome, "desc": a.get("descricao", ""),
            "model": a.get("modelo"), "provider": a.get("provedor"), "skills": a.get("skills", []),
            "max_turns": a.get("max_turns"),
            "status": st, "elapsed_s": rod.get(nome),
            "last": ult,
            "runs_today": sum(1 for e in h if e["ts"].startswith(hoje)),
            "errors_today": sum(1 for e in h if e["ts"].startswith(hoje) and e["code"] != 0),
            "runs_total": len(h),
            "recent": h[-8:][::-1],
        })
    crons = cron_dados()
    concluidos = [dict(e, type="agent") for e in hist[-60:]]
    em_execucao = []        # o que está rodando AGORA aparece sempre, além dos 40 concluídos
    for a in agentes:
        if a["status"] == "running":
            ini = agora - timedelta(seconds=a["elapsed_s"] or 0)
            em_execucao.append({"ts": ini.strftime("%Y-%m-%d %H:%M:%S"), "agent": a["id"], "type": "agent",
                                "model": a["model"], "code": 0, "fallback": False, "running": True})
    for c in crons:
        ex = c.pop("_execs")
        if c["running"]:
            c["status"] = "running"
            vivo = next((e for e in ex if e.get("status") in ("running", "claimed") and pid_vivo(e.get("pid"))), None)
            if vivo:
                em_execucao.append({"ts": (vivo.get("started_at") or "")[:19].replace("T", " "), "agent": c["id"],
                                    "type": "cron", "model": None, "code": 0, "fallback": False, "running": True})
        elif c["last_exec_status"] == "failed" or (c["last_status"] not in (None, "ok")):
            c["status"] = "error"
        elif c["enabled"] is False:
            c["status"] = "idle"
        else:
            c["status"] = "ok"
        # checagens de 0,2s (o job só verifica se é hora) não entram no feed; só as que trabalharam ou falharam
        for e in ex[:100]:
            if e["status"] == "failed" or dur(e) > 5:
                concluidos.append({"ts": (e["started_at"] or "")[:19].replace("T", " "), "agent": c["id"], "type": "cron",
                                   "model": None, "code": 1 if e["status"] == "failed" else 0, "fallback": False,
                                   "dur": round(dur(e))})
    for a in agentes:    # agente que TAMBÉM roda como job de cron SEM agente (campo "cron_job" no agentes.json): o boneco mostra a última execução do job se for mais nova
        job = cat.get(a["id"], {}).get("cron_job")
        c = next((x for x in crons if x["name"] == job), None) if job else None
        if not c or not c.get("last_run"):
            continue
        ts = c["last_run"][:19].replace("T", " ")
        if a["last"] and a["last"]["ts"] >= ts:
            continue
        code = 1 if (c.get("last_exec_status") == "failed" or c.get("last_status") not in (None, "ok")) else 0
        ev = {"ts": ts, "agent": a["id"], "model": "cron", "fallback": False, "code": code}
        a["last"] = ev
        a["recent"] = [ev] + a["recent"][:7]
        a["runs_today"] += 1 if ts.startswith(hoje) else 0
        a["errors_today"] += 1 if (code and ts.startswith(hoje)) else 0
        a["runs_total"] += 1
        if a["status"] != "running":
            a["status"] = "error" if code else "ok"
    concluidos.sort(key=lambda e: e["ts"], reverse=True)
    em_execucao.sort(key=lambda e: e["ts"], reverse=True)
    feed = em_execucao + concluidos[:40]      # sempre: todos os em execução + os 40 concluídos mais recentes
    todos = agentes + crons
    kp = {
        "running": sum(1 for x in todos if x["status"] == "running"),
        "runs_today": sum(x.get("runs_today", 0) for x in agentes),
        "errors_today": sum(x.get("errors_today", 0) for x in agentes) + sum(c["failed_today"] for c in crons),
        "in_error": sum(1 for x in todos if x["status"] == "error"),
        "agents": len(agentes), "crons": len(crons),
        "last_activity": feed[0]["ts"] if feed else None,
    }
    pessoas, equipe = equipe_painel()
    layout, origem = montar_layout(cat, [c["id"] for c in crons], [p["id"] for p in pessoas])
    jarvis = jarvis_estado()
    for x in todos + [jarvis]:
        z, motivo = origem.get(x["id"], ("", ""))
        x["setor"], x["setor_motivo"] = z, motivo
    sem_setor = [i for i, (z, m) in origem.items() if m.startswith("padrão")]
    return {"now": agora.strftime("%Y-%m-%d %H:%M:%S"), "agents": agentes, "crons": crons,
            "feed": feed, "kpis": kp, "layout": layout, "sem_setor": sem_setor, "jarvis": jarvis, "claude_usage": claude_uso(), "vault": vault_painel(), "pessoas": pessoas, "equipe": equipe}


def atividade(agente):
    """Últimas ferramentas chamadas pelo agente (só NOME da ferramenta e hora; nunca argumentos, comandos nem respostas).
    O state.db não registra qual agente abriu a sessão: o vínculo é aproximado, por modelo + horário de início."""
    cat = json.load(open(AGENTES, encoding="utf8"))
    if agente not in cat:
        return {"erro": "agente desconhecido"}
    modelo = cat[agente].get("modelo")
    rod = rodando_agora()
    agora = time.time()
    ao_vivo = agente in rod
    if ao_vivo:
        inicio, fim = agora - rod[agente] - 5, None
    else:
        h = [e for e in historico() if e["agent"] == agente]
        if not h:
            return {"agent": agente, "live": False, "events": [], "total": 0, "sessao": None}
        fim = time.mktime(time.strptime(h[-1]["ts"], "%Y-%m-%d %H:%M:%S"))
        inicio = None
    try:
        con = sqlite3.connect("file:%s?mode=ro" % STATE_DB, uri=True, timeout=3)
        marcas = ",".join("?" * len(FONTES_NAO_INTERATIVAS))
        cand = con.execute("select id, started_at from sessions where source='oneshot' and model=? order by started_at desc limit 40", (modelo,)).fetchall()
        sid = None
        for i, ini in cand:
            n, ult = con.execute("select count(*), max(timestamp) from messages where session_id=?", (i,)).fetchone()
            if n <= 2:
                continue                      # chamada mínima de teste do modelo, não é o trabalho
            if ao_vivo and ini >= inicio:
                sid = i; break
            if not ao_vivo and ult and ult <= fim + 5:
                sid = i; break
        if not sid:
            con.close()
            return {"agent": agente, "live": ao_vivo, "events": [], "total": 0, "sessao": None}
        ev, ultima = [], None
        for tc, ts in con.execute("select tool_calls, timestamp from messages where session_id=? and role='assistant' and tool_calls is not null order by timestamp, id", (sid,)):
            try:
                for c in json.loads(tc):
                    ev.append({"t": datetime.fromtimestamp(ts).strftime("%H:%M:%S"), "tool": (c.get("function") or {}).get("name", "?")})
            except Exception:
                pass
        ultima = con.execute("select max(timestamp) from messages where session_id=?", (sid,)).fetchone()[0]
        con.close()
    except Exception as e:
        return {"erro": "state.db indisponível"}
    return {"agent": agente, "live": ao_vivo, "total": len(ev), "events": ev[-15:], "sessao": sid[:15],
            "parado_ha_s": int(agora - ultima) if (ao_vivo and ultima) else None}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = self.path.split("?")[0]
        try:
            if p == "/api/state":
                self._send(200, json.dumps(estado(), ensure_ascii=False).encode("utf8"), "application/json; charset=utf-8")
            elif p == "/api/atividade":
                from urllib.parse import urlparse, parse_qs
                ag = (parse_qs(urlparse(self.path).query).get("agent") or [""])[0]
                self._send(200, json.dumps(atividade(ag), ensure_ascii=False).encode("utf8"), "application/json; charset=utf-8")
            elif p in ("/", "/index.html"):
                self._send(200, open(os.path.join(AQUI, "index.html"), "rb").read(), "text/html; charset=utf-8")
            else:
                self._send(404, b"not found", "text/plain")
        except Exception as e:
            self._send(500, ("erro: %s" % e).encode("utf8"), "text/plain; charset=utf-8")


if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print("Sala de Operações em http://127.0.0.1:%d" % porta, flush=True)
    ThreadingHTTPServer(("127.0.0.1", porta), H).serve_forever()
