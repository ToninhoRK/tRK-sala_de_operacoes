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
import os, re, sys, json, time, sqlite3, subprocess, threading
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
# Só para o teste de cenários (testar_sala.py): catálogo, jobs e equipe fictícios, sem tocar nos arquivos reais
AGENTES = os.environ.get("SALA_AGENTES") or AGENTES
JOBS = os.environ.get("SALA_JOBS") or JOBS
if not os.path.exists(AGENTES):
    AGENTES = os.path.join(EXEMPLO, "agentes.json")
if not os.path.exists(JOBS):
    JOBS = os.path.join(EXEMPLO, "cron_jobs.json")
# Histórico próprio da Sala para os jobs: o executions.db do Hermes guarda só as últimas ~1000 execuções (uns 2 dias, com os
# jobs de 5 em 5 min). Gravado pelo vigia_sala.py a cada 5 min: só execuções que trabalharam (> 5 s), falharam ou recuperaram o job depois de uma falha, até 100 dias.
HIST_CRON = os.environ.get("SALA_HIST_CRON") or os.path.join(HERMES, "data", "sala_historico_cron.jsonl")
# Janelas de manutenção (manutencao.py): dentro da janela, falha e atraso não alarmam e não contam no índice de sucesso.
MANUT = os.environ.get("SALA_MANUT") or os.path.join(HERMES, "data", "sala_manutencao.json")
CONFIG = os.path.expanduser(os.environ.get("SALA_CONFIG", "~/.hermes/data/sala_config.json"))   # responsavel_padrao (opcional)
# Sinal de vida do vigia_sala.py (gravado no início de cada rodada): parado há mais de 15 min = fonte com problema
VIGIA = os.environ.get("SALA_VIGIA") or os.path.join(HERMES, "data", "sala_vigia.json")
VIGIA_ATRASO_S = 900
# Pasta onde o Hermes procura os scripts dos jobs e os prompts dos agentes: arquivo que sumiu daqui = falha certa na próxima rodada
SCRIPTS_DIR = os.path.join(HERMES, "scripts")
PERIODOS = (7, 15, 30, 60, 90)   # dias dos indicadores (tendência, índice de sucesso, consumo), escolhidos no CONFIGURAR

# Layout da planta: gerado a partir de layout.json (setores) + agentes.json. Nada de agente novo fica de fora:
# quem não casa com nenhum setor vai para a sala padrão ("NOVOS AGENTES").
LAYOUT_JSON = os.path.join(AQUI, "layout.json")
LARG = 4.2          # largura de uma coluna de estações (unidades da planta)
PASSO2 = 5.6        # passo entre fileiras quando a sala tem 2+ fileiras
PASSO1 = 3.4        # idem, sala de 1 fileira
TOPO = 2.4          # faixa da parede dos fundos (placa) antes da 1ª fileira
GAP = 0.8           # espaço entre salas na mesma linha
CORREDOR = 1.6      # corredor entre a linha de cima e a de baixo


SAUDE = []          # problemas de leitura das fontes na montagem atual do /api/state (vai para a faixa âmbar da página)


def ler_json(caminho):
    """json.load que fecha o arquivo (o open() solto deixava o arquivo aberto até o coletor de lixo)."""
    with open(caminho, encoding="utf8") as f:
        return json.load(f)


def problema(fonte, msg, msg_en=None):
    """Fonte de dados com problema. msg (português) vai para a tela e para o e-mail do vigia; msg_en, para a tela em inglês."""
    if not any(x["fonte"] == fonte for x in SAUDE):
        SAUDE.append({"fonte": fonte, "msg": msg, "msg_en": msg_en or msg})


def carregar_layout():
    try:
        return ler_json(LAYOUT_JSON)
    except Exception:
        problema("layout.json", "layout.json ilegível: salas no padrão", "layout.json unreadable: default rooms")
        return {"setores": [], "padrao": {"id": "novos", "titulo": "NOVOS AGENTES", "linha": "baixo"}, "fluxos": []}


def montar_layout(cat, cron_ids, equipe_ids=()):
    """Devolve (layout, origem) onde origem[id] = (setor, motivo). equipe_ids = estação da equipe (uma só, com os totais) na sala tipo "equipe"."""
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
        if z.get("tipo") == "equipe":    # sala da equipe (Agidesk): uma estação com os totais da equipe (nada por pessoa); sem dados, a sala não aparece
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
                try:
                    evs = eventos_log(os.path.join(LOGS, n))
                except Exception:
                    problema("log " + n, "log de agente ilegível: " + n, "agent log unreadable: " + n)
                    continue
                for e in evs:
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


EVENTOS_MAX_BYTES = 2_000_000   # lê só o fim do eventos.jsonl (cada execução = 2 linhas de ~200 bytes)


def execucoes():
    """Execuções gravadas pelo rodar_agente.py em eventos.jsonl (início e fim; desde a Fase 5, 15/10/2026).
    Devolve {pid_t: {agente, ini, fim, codigo, duracao_s, modelo, sessoes, vivo}}. Arquivo ausente = lista vazia (executor antigo)."""
    caminho = os.path.join(LOGS, "eventos.jsonl")
    out = {}
    try:
        with open(caminho, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - EVENTOS_MAX_BYTES))
            linhas = f.read().decode("utf8", "ignore").splitlines()
    except FileNotFoundError:
        return out
    except Exception:
        problema("eventos.jsonl", "eventos.jsonl do executor ilegível: rodando/custo pelo método aproximado",
                 "executor eventos.jsonl unreadable: running/cost by the approximate method")
        return out
    abertos = {}
    for l in linhas:
        try:
            d = json.loads(l)
            pid, t, ag = d["pid"], float(d["t"]), d["agente"]
        except Exception:
            continue
        if d.get("ev") == "inicio":
            k = "%s_%d" % (pid, t)
            out[k] = {"agente": ag, "ini": t, "fim": None, "codigo": None, "duracao_s": None, "modelo": d.get("modelo"), "sessoes": [], "pid": pid}
            abertos[pid] = k
        elif d.get("ev") == "fim" and pid in abertos:
            x = out[abertos.pop(pid)]
            x.update(fim=t, codigo=d.get("codigo"), duracao_s=d.get("duracao_s"), sessoes=d.get("sessoes") or [], modelo=d.get("modelo") or x["modelo"])
    for x in out.values():
        x["vivo"] = x["fim"] is None and pid_vivo(x["pid"])
    return out


def uteis_s(a, b):
    """Segundos entre os instantes a e b sem contar sábados e domingos (hora local)."""
    if b <= a:
        return 0
    tot, t = 0.0, a
    while t < b:
        d = datetime.fromtimestamp(t)
        prox = (d.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).timestamp()
        if d.weekday() < 5:
            tot += min(prox, b) - t
        t = prox
    return tot


def ts_local(t):
    return datetime.fromtimestamp(t).strftime("%Y-%m-%d %H:%M:%S")


_CUSTO = {}     # dias -> (instante do cálculo, custos)


def custos(hist, exs, dias=7):
    """Custo (US$ estimado pelo Hermes), tokens e duração por agente nos últimos `dias`, da tabela sessions do state.db (só números).
    Exato quando a execução tem evento com o id das sessões; para execuções sem evento (executor antigo) o vínculo é aproximado:
    sessão 'oneshot' do mesmo modelo que terminou até 5 s antes do registro no log e começou no máximo 35 min antes."""
    corte = time.time() - dias * 86400
    r = {}
    if not os.path.exists(STATE_DB):
        return r
    try:
        con = sqlite3.connect("file:%s?mode=ro" % STATE_DB, uri=True, timeout=3)
        sess = {row[0]: row[1:] for row in con.execute(
            "select id, model, started_at, ended_at, coalesce(estimated_cost_usd,0), coalesce(input_tokens,0)+coalesce(output_tokens,0) "
            "from sessions where source='oneshot' and started_at>=?", (corte - 3600,))}
        con.close()
    except Exception:
        problema("state.db", "state.db ilegível: sem custo por agente", "state.db unreadable: no cost per agent")
        return r
    usadas = set()

    def soma(ag, ids, aprox):
        x = r.setdefault(ag, {"custo_usd": 0.0, "tokens": 0, "execucoes": 0, "aprox": False})
        for i in ids:
            if i in sess:
                usadas.add(i)
                x["custo_usd"] += sess[i][3]
                x["tokens"] += sess[i][4]
        x["execucoes"] += 1
        x["aprox"] = x["aprox"] or aprox
    com_evento = []
    for x in exs.values():
        if x["fim"] and x["fim"] >= corte:
            soma(x["agente"], x["sessoes"], False)
            com_evento.append((x["agente"], x["fim"]))
    for e in hist:      # cronológico: cada execução fica com as sessões dela antes que a seguinte do mesmo modelo as alcance
        t = time.mktime(time.strptime(e["ts"], "%Y-%m-%d %H:%M:%S"))
        if t < corte or any(a == e["agent"] and abs(f - t) <= 10 for a, f in com_evento):
            continue
        ids = [k for k, v in sess.items() if k not in usadas and v[0] == e["model"] and v[2] and v[2] <= t + 5 and v[1] >= t - 2100]
        soma(e["agent"], ids, True)
    for x in r.values():
        x["custo_usd"] = round(x["custo_usd"], 4)
    return r


def tendencia(hist, crons_execs, dias=7):
    """Execuções e falhas por dia nos últimos `dias` (hoje por último): agentes (log) + jobs de cron sem agente que trabalharam."""
    hoje = datetime.now().date()
    ds = [(hoje - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(dias - 1, -1, -1)]
    tot = {d: [0, 0] for d in ds}
    por = {}
    for e in hist:
        d = e["ts"][:10]
        if d in tot:
            tot[d][0] += 1; tot[d][1] += e["code"] != 0
            p = por.setdefault(e["agent"], {x: [0, 0] for x in ds}); p[d][0] += 1; p[d][1] += e["code"] != 0
    for cid, ex in crons_execs:
        for e in ex:
            d = (e.get("started_at") or "")[:10]
            if d in tot and trabalhou(e):
                f = e["status"] == "failed"
                tot[d][0] += 1; tot[d][1] += f
                p = por.setdefault(cid, {x: [0, 0] for x in ds}); p[d][0] += 1; p[d][1] += f
    return ([{"dia": d, "execucoes": tot[d][0], "falhas": tot[d][1]} for d in ds],
            {k: [v[d] for d in ds] for k, v in por.items()})


ATRASO_TOLERANCIA_S = 600   # job com a próxima rodada vencida há mais de 10 min (e sem estar rodando) = ATRASADO: o agendador não disparou (Mac dormindo, gateway parado)
ANTIGO_S = 7 * 86400        # agente sem rodar há mais de 7 dias: selo apagado (não é falha; agentes sob demanda passam dias parados)


def iso_epoch(s):
    """'2026-10-15T15:20:00-03:00' (ou sem fuso, hora local) -> epoch; None se vazio ou ilegível."""
    if not s:
        return None
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d.timestamp()
    except Exception:
        return None


def atraso_job(jb, rodando, agora=None):
    """Segundos de atraso de um job ativo cuja próxima rodada já passou da tolerância; None se em dia, pausado ou rodando."""
    if rodando or jb.get("enabled") is False or jb.get("paused_at") or jb.get("state") == "paused":
        return None
    prox = iso_epoch(jb.get("next_run_at"))
    agora = time.time() if agora is None else agora
    if prox is None or agora - prox <= ATRASO_TOLERANCIA_S:
        return None
    return int(agora - prox)


JOBS_OCULTOS = {"govti-vault-contagem", "govti-equipe-agidesk"}   # jobs de apoio da própria Sala (contagem da placa da Diretoria; números da sala GOVERNANÇA): rodam a cada 5 min e não aparecem nem no feed

def cron_hist_sala():
    """Execuções de jobs guardadas pela própria Sala (vigia_sala.py): {job_id: [execução, ...]}. Sem o arquivo = vazio."""
    out = {}
    try:
        with open(HIST_CRON, encoding="utf8") as f:
            for l in f:
                try:
                    d = json.loads(l)
                    out.setdefault(d["job_id"], []).append({"job_id": d["job_id"], "status": d["status"], "pid": None,
                                                            "started_at": d["started_at"], "finished_at": d.get("finished_at"), "error": None})
                except Exception:
                    continue
    except FileNotFoundError:
        pass
    except Exception:
        problema("histórico da Sala", "histórico próprio dos jobs ilegível: indicadores dos jobs só com os últimos ~2 dias",
                 "the room's own job history is unreadable: job indicators only cover the last ~2 days")
    return out


def janelas_manutencao():
    """{id da estação: [(início, fim, motivo)]} do sala_manutencao.json (gravado pelo manutencao.py). Sem o arquivo = nenhuma."""
    try:
        d = ler_json(MANUT)
    except FileNotFoundError:
        return {}
    except Exception:
        problema("manutenção", "sala_manutencao.json ilegível: janelas de manutenção ignoradas",
                 "sala_manutencao.json unreadable: maintenance windows ignored")
        return {}
    out = {}
    for j in (d.get("janelas") or []) if isinstance(d, dict) else []:
        try:
            ini = time.mktime(time.strptime(j["de"], "%Y-%m-%d %H:%M"))
            fim = time.mktime(time.strptime(j["ate"], "%Y-%m-%d %H:%M"))
        except Exception:
            problema("manutenção", "janela de manutenção com data inválida (%s): ignorada" % j.get("id"),
                     "maintenance window with an invalid date (%s): ignored" % j.get("id"))
            continue
        out.setdefault(j.get("id"), []).append((ini, fim, j.get("motivo") or ""))
    return out


_ACORDOU = [0.0, None]


def acordou_ha():
    """Segundos desde que o Mac acordou (sysctl kern.waketime); None fora do macOS ou se não der para ler. Cache de 30 s."""
    agora = time.time()
    if agora - _ACORDOU[0] > 30:
        _ACORDOU[0], _ACORDOU[1] = agora, None
        try:
            r = subprocess.run(["sysctl", "-n", "kern.waketime"], capture_output=True, text=True, timeout=2).stdout
            m = re.search(r"sec = (\d+)", r)
            if m and int(m.group(1)) > 0:
                _ACORDOU[1] = int(m.group(1))
        except Exception:
            pass
    return agora - _ACORDOU[1] if _ACORDOU[1] else None


def vigia_saude(agora_s):
    """Vigia parado (sem aviso por e-mail nem histórico novo dos jobs) ou com erro na última rodada vira fonte com problema.
    Sem o arquivo (instalação sem vigia) não é problema. Logo depois de o Mac acordar, espera o vigia rodar (10 min)."""
    try:
        v = ler_json(VIGIA)
    except FileNotFoundError:
        return
    except Exception:
        problema("vigia", "sala_vigia.json ilegível", "sala_vigia.json unreadable")
        return
    idade = agora_s - (v.get("rodou_em") or 0)
    acordou = acordou_ha()
    if idade > VIGIA_ATRASO_S and not (acordou is not None and acordou < 600):
        problema("vigia", "o vigia da Sala não roda há %d min: sem aviso por e-mail e sem histórico novo dos jobs" % (idade // 60),
                 "the room's watcher has not run for %d min: no e-mail alerts and no new job history" % (idade // 60))
    elif v.get("erro"):
        problema("vigia", "vigia da Sala: %s" % v["erro"], "room watcher: %s" % v["erro"])


def arquivos_faltando(cat, jobs):
    """Script de job, prompt de agente ou script de pós-validação que não existe mais: a próxima rodada vai falhar.
    Acusa ANTES da falha (em 15/10/2026 uma sincronização apagou prompts e scripts e só se soube quando os jobs falharam).
    Só confere numa instalação do Hermes (sem a pasta de scripts, como nos dados de exemplo, não confere nada)."""
    if not os.path.isdir(SCRIPTS_DIR):
        return
    falta = []
    for jb in jobs:
        s = jb.get("script")
        if s and jb.get("enabled", True) and not os.path.exists(os.path.join(SCRIPTS_DIR, os.path.basename(s))):
            falta.append("script do job %s (%s)" % (jb.get("name"), os.path.basename(s)))
    for nome, a in cat.items():
        p = a.get("prompt")
        if p and not os.path.exists(os.path.join(SCRIPTS_DIR, p)):
            falta.append("prompt do agente %s (%s)" % (nome, p))
        s = (a.get("pos_validacao") or {}).get("script")
        if s and not os.path.exists(os.path.expanduser(s)):
            falta.append("pós-validação do agente %s (%s)" % (nome, os.path.basename(s)))
    if falta:
        problema("arquivos", "%d arquivo(s) de agente/job sumiram (a próxima rodada vai falhar): %s" % (len(falta), "; ".join(falta)),
                 "%d agent/job file(s) are missing (the next run will fail): %s" % (len(falta), "; ".join(falta)))


def em_manutencao(janelas, t):
    return next((w for w in janelas if w[0] <= t <= w[1]), None)


def indice_sucesso(execs, janelas, corte):
    """Índice de sucesso no período: [(instante, falhou)] desde `corte` -> execuções, falhas, % OK.
    Execução dentro de janela de manutenção fica de fora (conta só em \"manutencao\")."""
    n = f = fora = 0
    for t, falhou in execs:
        if t < corte:
            continue
        if em_manutencao(janelas, t):
            fora += 1
            continue
        n += 1
        f += bool(falhou)
    return {"execucoes": n, "falhas": f, "pct": round(100.0 * (n - f) / n, 1) if n else None, "manutencao": fora}


CRON_JOBS_TODOS = []

# ---- tela JOBS (16/10/2026): agendamento por extenso e próximas execuções, calculados da expressão cron do jobs.json ----
DIAS_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]            # numeração do cron: 0 = domingo
DIAS_LONGO = ["todo domingo", "toda segunda-feira", "toda terça-feira", "toda quarta-feira", "toda quinta-feira",
              "toda sexta-feira", "todo sábado"]
PROXIMAS_DIAS = 7          # quantos dias à frente a tela JOBS mostra
PROXIMAS_MAX = 300         # teto por job (um job de minuto em minuto daria 10 mil): a tela avisa quando corta


def cron_campo(txt, lo, hi):
    """Um campo da expressão cron ('*', '*/15', '8-17', '1,4', '8-18/2', '5/10') -> conjunto de valores; ValueError se inválido."""
    vals = set()
    for parte in txt.split(","):
        base, barra, passo = parte.partition("/")
        passo = int(passo) if passo else 1
        if passo < 1:
            raise ValueError(txt)
        if base == "*":
            a, b = lo, hi
        elif "-" in base:
            a, b = (int(x) for x in base.split("-", 1))
        else:
            a = int(base)
            b = hi if barra else a              # '5/10' = de 5 até o fim, de 10 em 10
        if a < lo or b > hi or a > b:
            raise ValueError(txt)
        vals.update(range(a, b + 1, passo))
    return vals


def cron_campos(expr):
    p = (expr or "").split()
    if len(p) != 5:
        raise ValueError(expr)
    return {"min": cron_campo(p[0], 0, 59), "hora": cron_campo(p[1], 0, 23), "dia": cron_campo(p[2], 1, 31),
            "mes": cron_campo(p[3], 1, 12), "sem": {d % 7 for d in cron_campo(p[4], 0, 7)},
            "dia_livre": p[2] == "*", "sem_livre": p[4] == "*"}


def proximas_execucoes(expr, desde, ate):
    """Instantes (epoch, hora local) em que a expressão cron dispara entre `desde` (inclusive) e `ate`. Dia do mês e dia
    da semana restritos ao mesmo tempo valem com OU (regra do cron). Para em PROXIMAS_MAX."""
    c = cron_campos(expr)
    out = []
    dia = datetime.fromtimestamp(desde).date()
    fim = datetime.fromtimestamp(ate).date()
    while dia <= fim and len(out) < PROXIMAS_MAX:
        sem = (dia.weekday() + 1) % 7
        m_dia, m_sem = dia.day in c["dia"], sem in c["sem"]
        if c["dia_livre"] and c["sem_livre"]:
            vale = True
        elif c["dia_livre"]:
            vale = m_sem
        elif c["sem_livre"]:
            vale = m_dia
        else:
            vale = m_dia or m_sem
        if vale and dia.month in c["mes"]:
            for h in sorted(c["hora"]):
                for m in sorted(c["min"]):
                    t = datetime(dia.year, dia.month, dia.day, h, m).timestamp()
                    if desde <= t <= ate:
                        out.append(t)
        dia += timedelta(days=1)
    return out[:PROXIMAS_MAX]


def _hm(h, m, en=False):
    if en:
        return "%02d:%02d" % (h, m)
    return "%dh" % h if m == 0 else "%dh%02d" % (h, m)


DIAS_CURTO_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
DIAS_LONGO_EN = ["every Sunday", "every Monday", "every Tuesday", "every Wednesday", "every Thursday", "every Friday",
                 "every Saturday"]


def agenda_texto(expr, en=False):
    """Expressão cron -> texto ('dias úteis, de hora em hora, das 8h às 18h'; en=True: 'weekdays, every hour, 08:00 to
    18:00'); o que não reconhece volta como 'cron <expr>'."""
    try:
        c = cron_campos(expr)
    except (ValueError, TypeError):
        return "cron %s" % expr if expr else ""
    p = expr.split()
    if p[3] != "*":
        return "cron " + expr
    e = " and " if en else " e "
    junta = lambda xs: ", ".join(xs[:-1]) + e + xs[-1] if len(xs) > 1 else xs[0]
    sem = sorted(c["sem"])
    if not c["dia_livre"]:
        if not c["sem_livre"]:
            return "cron " + expr
        ds = [str(d) for d in sorted(c["dia"])]
        dias = ("on day%s %s of the month" % ("s" if len(ds) > 1 else "", junta(ds))) if en else "todo dia %s do mês" % junta(ds)
    elif c["sem_livre"] or sem == list(range(7)):
        dias = "every day" if en else "todo dia"
    elif sem == [1, 2, 3, 4, 5]:
        dias = "weekdays" if en else "dias úteis"
    elif sem == [0, 6]:
        dias = "Saturday and Sunday" if en else "sábado e domingo"
    elif len(sem) == 1:
        dias = (DIAS_LONGO_EN if en else DIAS_LONGO)[sem[0]]
    else:
        nomes = [(DIAS_CURTO_EN if en else DIAS_CURTO)[d] for d in (sem[1:] + [0] if sem[0] == 0 else sem)]    # domingo por último
        dias = junta(nomes)
    hs, ms = sorted(c["hora"]), sorted(c["min"])
    if len(ms) == 1:
        m = ms[0]
        if len(hs) == 1:
            hora = ("at " if en else "às ") + _hm(hs[0], m, en)
        elif len(hs) == 24:
            hora = ("every hour" + (" (at :%02d)" % m if m else "")) if en else ("de hora em hora" + (" (aos %02d min)" % m if m else ""))
        elif hs == list(range(hs[0], hs[-1] + 1)):
            hora = ("every hour, %s to %s" if en else "de hora em hora, das %s às %s") % (_hm(hs[0], m, en), _hm(hs[-1], m, en))
        elif len(hs) <= 6:
            hora = ("at " if en else "às ") + junta([_hm(h, m, en) for h in hs])
        else:
            return "cron " + expr
    elif len(hs) == 24 and ms[0] == 0 and len(ms) > 1 and 60 % len(ms) == 0 and ms == list(range(0, 60, 60 // len(ms))):
        hora = ("every %d min" if en else "a cada %d min") % (60 // len(ms))
    else:
        return "cron " + expr
    return "%s, %s" % (dias, hora)


def cron_dados():
    jobs = []
    try:
        j = ler_json(JOBS)
        jobs = j["jobs"] if isinstance(j, dict) and "jobs" in j else j
    except Exception:
        problema("jobs.json", "jobs.json do cron ilegível: os jobs agendados não aparecem", "cron jobs.json unreadable: scheduled jobs are not shown")
        return []
    CRON_JOBS_TODOS[:] = jobs          # inclusive os ocultos: o script deles também precisa existir
    jobs = [x for x in jobs if x.get("name") not in JOBS_OCULTOS and not (x.get("name") or "").startswith("avulso-")]   # "avulso-*" = demandas pontuais fora do monitoramento
    execs = {}
    try:
        # o executions.db está em modo WAL: com mode=ro o SQLite recusa ("unable to open database file"); mode=rw + query_only lê sem poder escrever
        con = sqlite3.connect("file:%s?mode=rw" % EXEC_DB, uri=True, timeout=5)
        con.execute("PRAGMA query_only=ON")
        con.row_factory = sqlite3.Row
        for r in con.execute("select job_id,status,pid,started_at,finished_at,error from executions "
                             "order by claimed_at desc limit 400"):
            execs.setdefault(r["job_id"], []).append(dict(r))
        con.close()
    except Exception as e:
        # sem o banco, os jobs aparecem sem execuções (nunca "rodando" e fora do feed): avisar na página em vez de engolir o erro
        if os.path.exists(EXEC_DB):      # sem Hermes (colega com os dados de exemplo) o banco não existe: não é problema
            problema("executions.db", "executions.db do cron ilegível (%s): sem execuções dos jobs" % e, "cron executions.db unreadable (%s): no job runs" % e)
    for jid, lst in cron_hist_sala().items():    # completa com o histórico da Sala (o banco do Hermes guarda só uns 2 dias)
        ja = {e.get("started_at") for e in execs.get(jid, [])}
        novos = [e for e in lst if e["started_at"] not in ja]
        if novos:
            execs.setdefault(jid, []).extend(novos)
            execs[jid].sort(key=lambda e: e.get("started_at") or "9999", reverse=True)   # sem início (só reivindicada) = a mais nova
    for lst in execs.values():
        marcar_recuperacao(lst)
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
            "paused": bool(jb.get("paused_at") or jb.get("state") == "paused"),
            "atrasado_s": atraso_job(jb, bool(rodando)),
            "next_run": jb.get("next_run_at"), "last_run": jb.get("last_run_at"),
            "last_status": jb.get("last_status"),
            "running": bool(rodando),
            "checks_today": sum(1 for e in ex if (e.get("started_at") or "").startswith(hoje)),
            "failed_today": sum(1 for e in ex if (e.get("started_at") or "").startswith(hoje) and e["status"] == "failed"),
            "last_exec_status": ultimo["status"] if ultimo else None,
            "work_today": sum(1 for e in ex if (e.get("started_at") or "").startswith(hoje) and trabalhou(e)),
            "chama_agente": chama_agente(jb.get("script")),
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
    except Exception as e:
        # falha de leitura do state.db: o Jarvis aparece "disponível", sem derrubar o /api/state
        if os.path.exists(STATE_DB):
            problema("state.db", "state.db ilegível: Jarvis sem estado e sem \"sem ação\" dos agentes", "state.db unreadable: no Jarvis state and no agent \"no activity\" time")
    return base


def chama_agente(script):
    """True se o script do job roda um agente (rodar_agente.py): essa execução já conta como execução do agente."""
    if not script:
        return False
    try:
        return "rodar_agente" in open(os.path.join(HERMES, "scripts", os.path.basename(script)), encoding="utf8", errors="ignore").read()
    except Exception:
        return False


SEM_ACAO_S = 300     # agente rodando sem nenhuma mensagem nova há 5 min: "SEM AÇÃO" na planta (ferramenta demorando ou travado)


def sem_acao(modelo, inicio):
    """Segundos desde a última mensagem da sessão 'oneshot' do modelo aberta depois de `inicio` (vínculo aproximado, igual ao popup).
    Só lê hora de mensagens do state.db, nunca o conteúdo. None se não achar a sessão."""
    try:
        con = sqlite3.connect("file:%s?mode=ro" % STATE_DB, uri=True, timeout=3)
        for sid, in con.execute("select id from sessions where source='oneshot' and model=? and started_at>=? order by started_at", (modelo, inicio - 5)).fetchall():
            n, ult = con.execute("select count(*), max(timestamp) from messages where session_id=?", (sid,)).fetchone()
            if n > 2 and ult:
                con.close()
                return int(time.time() - ult)
        con.close()
    except Exception:
        if os.path.exists(STATE_DB):
            problema("state.db", "state.db ilegível: sem o tempo \"sem ação\" dos agentes", "state.db unreadable: no agent \"no activity\" time")
    return None


def dur(e):
    try:
        a = datetime.fromisoformat(e["started_at"]); b = datetime.fromisoformat(e["finished_at"])
        return (b - a).total_seconds()
    except Exception:
        return 0


def marcar_recuperacao(ex):
    """Marca com e[\"recuperacao\"]=True a 1ª execução concluída com sucesso depois de uma falha do mesmo job (qualquer duração).
    Sem isso, o job que falha e volta em menos de 5 s (envio ao GitHub sem novidade, por exemplo) deixava a falha como o último
    registro visível: a execução boa e curta nunca entrava no feed, na JOBS nem no histórico. Só essa execução entra; as
    checagens rápidas seguintes continuam de fora."""
    anterior = None
    for e in sorted((x for x in ex if x.get("started_at") and x.get("status") not in ("running", "claimed")),
                    key=lambda x: x["started_at"]):
        if e["status"] != "failed" and anterior == "failed":
            e["recuperacao"] = True
        anterior = e["status"]


def trabalhou(e):
    """Execução que conta no feed, na tendência, no índice de sucesso e na JOBS: falhou, durou mais de 5 s ou é a que recuperou o job."""
    return e["status"] == "failed" or dur(e) > 5 or bool(e.get("recuperacao"))


CLAUDE_USO = os.path.join(HERMES, "data", "claude_uso.json")   # gravado pelo statusLine do Claude Code (claude_statusline.py)

def claude_uso():
    """Uso da assinatura Claude (sessao 5 h e semana 7 d), so percentual e hora de reinicio. Somente leitura.
    So atualiza quando uma sessao do Claude Code responde: por isso vai junto a hora da leitura e se a janela ja reiniciou."""
    try:
        j = ler_json(CLAUDE_USO)
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
EQUIPE_JSON = os.environ.get("SALA_EQUIPE") or os.path.join(HERMES, "data", "equipe_agidesk.json")   # gravado por equipe_agidesk.py (job de cron oculto govti-equipe-agidesk, a cada 5 min)
EQUIPE_VELHO_S = 900


def equipe_painel():
    """Sala GOVERNANÇA: UMA estação com os totais da equipe no Agidesk (em aberto, sem responsável, encerrados hoje). Somente leitura.
    NADA POR PESSOA chega ao navegador (decisão de 15/10/2026): nem nome nem número individual, mesmo se o arquivo for do formato antigo.
    Devolve ([estação], resumo) ou ([], None) sem dados. Leitura com mais de 15 min fica 'idle' (cinza); encerrados de outro dia aparecem como None."""
    try:
        j = ler_json(EQUIPE_JSON)
        if j.get("abertos_total") is None:
            raise ValueError("sem total")
    except Exception:
        return [], None
    age = int(time.time() - (j.get("updated_at") or 0))
    velho = age > EQUIPE_VELHO_S
    if velho:
        problema("equipe", "números da equipe do Agidesk defasados (lidos há %d min; job govti-equipe-agidesk)" % (age // 60),
                 "Agidesk team numbers are stale (read %d min ago; job govti-equipe-agidesk)" % (age // 60))
    hoje_ok = j.get("dia") == datetime.now().strftime("%Y-%m-%d")
    enc = j.get("encerrados_hoje_total")
    if enc is None and isinstance(j.get("encerrados_hoje"), dict):     # arquivo do formato antigo (por pessoa): só a soma sai daqui
        enc = sum(v for v in j["encerrados_hoje"].values() if isinstance(v, int))
    estacao = {"id": "equipe:agidesk", "kind": "equipe", "name": "Equipe", "status": "idle" if velho else "ok",
               "abertos": j.get("abertos_total"), "sem_responsavel": j.get("sem_responsavel"),
               "encerrados": enc if hoje_ok else None, "vencidos": j.get("vencidos"), "encerrados_7d": j.get("encerrados_7d"),
               "atendimento_medio_h": j.get("atendimento_medio_h_7d"), "atendimento_mediano_h": j.get("atendimento_mediano_h_7d"),
               "desc": "Totais da equipe Governança de TI no Agidesk, lidos a cada 5 min. Sem números por pessoa."}
    resumo = {"sem_responsavel": j.get("sem_responsavel"), "abertos_total": j.get("abertos_total"), "vencidos": j.get("vencidos"),
              "encerrados_7d": j.get("encerrados_7d"), "atendimento_medio_h": j.get("atendimento_medio_h_7d"),
              "atendimento_mediano_h": j.get("atendimento_mediano_h_7d"), "age_s": age, "velho": velho}
    # + 2 mesas ilustrativas (sem nome nem número; o clique abre a estação da equipe): a sala tem a profundidade da linha e, com uma mesa só, ficava vazia
    ilustr = [{"id": "equipe:mesa%d" % i, "kind": "equipe", "decor": True, "name": "", "status": estacao["status"],
               "desc": "Mesa ilustrativa da equipe (sem dados)."} for i in (2, 3)]
    return [estacao] + ilustr, resumo

def vault_painel():
    """Placa da DIRETORIA: total de notas do vault, variação (hoje e semana) e resultado da última conferência da auditoria. So numeros; somente leitura."""
    try:
        j = ler_json(VAULT_CONT)
    except Exception:
        return None
    agora = time.time(); hoje = datetime.now().strftime("%Y-%m-%d"); total = j.get("total")
    if agora - (j.get("updated_at") or agora) > 1800:
        problema("vault", "contagem do vault defasada (há %d min; job govti-vault-contagem)" % ((agora - j.get("updated_at")) // 60),
                 "vault count is stale (%d min old; job govti-vault-contagem)" % ((agora - j.get("updated_at")) // 60))
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

_LOCK, _CACHE = threading.Lock(), {}


def estado_json(dias=7):
    """/api/state com cache de 0,8 s por período: várias abas abertas não multiplicam ps + SQLite a cada segundo."""
    with _LOCK:
        c = _CACHE.get(dias)
        if c and time.time() - c[0] < 0.8:
            return c[1]
        del SAUDE[:]
        corpo = json.dumps(estado(dias), ensure_ascii=False).encode("utf8")
        _CACHE[dias] = (time.time(), corpo)
        return corpo


def indice_geral(agentes, crons, cat, falhas_fora=0):
    """Índice de sucesso de toda a operação no período, sem contar a mesma execução duas vezes: agentes (com as rodadas do job
    ligado por \"cron_job\" que não passa pelo agente) + jobs sem agente + falhas de job que chama agente sem registro no log."""
    ligados = {v.get("cron_job") for v in cat.values() if v.get("cron_job")}
    itens = agentes + [c for c in crons if not c["chama_agente"] and c["name"] not in ligados]
    n = sum(x["sucesso"]["execucoes"] for x in itens) + falhas_fora
    f = sum(x["sucesso"]["falhas"] for x in itens) + falhas_fora
    return {"execucoes": n, "falhas": f, "pct": round(100.0 * (n - f) / n, 1) if n else None}


def estado(dias=7):
    agora = datetime.now()
    hoje = agora.strftime("%Y-%m-%d")
    cat = ler_json(AGENTES)
    hist = historico()
    rod = rodando_agora()
    exs = execucoes()
    agora_s = time.time()
    idx = {}
    for e in hist:
        idx.setdefault(e["agent"], []).append((time.mktime(time.strptime(e["ts"], "%Y-%m-%d %H:%M:%S")), e))
    for x in exs.values():
        if x["vivo"]:                                  # evento de início sem fim e processo vivo: rodando (exato, não depende do ps)
            rod[x["agente"]] = max(rod.get(x["agente"], 0), int(agora_s - x["ini"]))
            continue
        fim = x["fim"] or x["ini"]
        if agora_s - fim > 30 * 86400:
            continue
        par = next((e for t, e in reversed(idx.get(x["agente"], [])) if abs(t - fim) <= 10), None)
        if par:
            par["dur"] = round(x["duracao_s"]) if x["duracao_s"] is not None else None
        elif x["agente"] in cat and (x["codigo"] or x["fim"] is None):
            # execução que terminou sem registro no log (morta por sinal, Mac desligado, executor quebrou): antes sumia; agora é falha
            hist.append({"ts": ts_local(fim), "agent": x["agente"], "model": x["modelo"] or "?", "code": x["codigo"] if x["codigo"] else -1,
                         "fallback": False, "interrompida": True, "dur": round(x["duracao_s"]) if x["duracao_s"] is not None else None})
    hist.sort(key=lambda e: e["ts"])
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
            "timeout_s": int(a.get("timeout_s", 1800)),
            "sem_acao_s": sem_acao(a.get("modelo"), time.time() - rod[nome]) if nome in rod else None,
            "last": ult,
            "runs_today": sum(1 for e in h if e["ts"].startswith(hoje)),
            "errors_today": sum(1 for e in h if e["ts"].startswith(hoje) and e["code"] != 0),
            "runs_total": len(h),
            "recent": h[-8:][::-1],
            "cadencia_h": a.get("cadencia_h"),
            "dias_uteis": bool(a.get("cadencia_dias_uteis")),
        })
    crons = cron_dados()
    concluidos = [dict(e, type="agent", name=e["agent"], status="ok" if e["code"] == 0 else "error") for e in hist[-60:]]
    em_execucao = []        # o que está rodando AGORA aparece sempre, além dos 40 concluídos
    for a in agentes:
        if a["status"] == "running":
            ini = agora - timedelta(seconds=a["elapsed_s"] or 0)
            em_execucao.append({"ts": ini.strftime("%Y-%m-%d %H:%M:%S"), "agent": a["id"], "type": "agent",
                                 "name": a["id"], "status": "running",
                                "model": a["model"], "code": 0, "fallback": False, "running": True})
    execs_cron = []
    for c in crons:
        ex = c.pop("_execs")
        execs_cron.append((c["id"], ex))
        if c["running"]:
            c["status"] = "running"
            vivo = next((e for e in ex if e.get("status") in ("running", "claimed") and pid_vivo(e.get("pid"))), None)
            if vivo:
                em_execucao.append({"ts": (vivo.get("started_at") or "")[:19].replace("T", " "), "agent": c["id"],
                                    "type": "cron", "name": c["id"], "status": "running",
                                    "model": None, "code": 0, "fallback": False, "running": True})
        elif c["last_exec_status"] == "failed" or (c["last_status"] not in (None, "ok")):
            c["status"] = "error"
        elif c["enabled"] is False or c["paused"]:
            c["status"] = "idle"
        else:
            c["status"] = "ok"
        # checagens de 0,2s (o job só verifica se é hora) não entram no feed; só as que trabalharam ou falharam
        for e in ex[:100]:
            if trabalhou(e):
                concluidos.append({"ts": (e["started_at"] or "")[:19].replace("T", " "), "agent": c["id"], "type": "cron",
                                   "model": None, "code": 1 if e["status"] == "failed" else 0, "fallback": False,
                                    "name": c["id"], "status": "error" if e["status"] == "failed" else "ok",
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
    for a in agentes:    # cadência opcional no agentes.json ("cadencia_h": 24 = deve rodar ao menos 1x por dia): passou de 1,2x sem rodar = ATRASADO
        ult_s = time.mktime(time.strptime(a["last"]["ts"], "%Y-%m-%d %H:%M:%S")) if a["last"] else None
        a["atrasado_s"] = None
        try:
            cad = float(a["cadencia_h"]) * 3600 if a["cadencia_h"] else None
        except (TypeError, ValueError):
            cad = None
        decorrido = (uteis_s(ult_s, agora_s) if a["dias_uteis"] else agora_s - ult_s) if ult_s else None   # dias úteis: sábado e domingo não contam
        if cad and a["status"] != "running" and (ult_s is None or decorrido > cad * 1.2):
            a["atrasado_s"] = int(decorrido - cad) if ult_s else int(cad)
        a["antigo"] = bool(a["status"] == "ok" and ult_s and agora_s - ult_s > ANTIGO_S and not a["atrasado_s"])
    # janelas de manutenção: falha/atraso dentro da janela não alarmam (selo e rótulo MANUTENÇÃO); rodando continua rodando
    jan = janelas_manutencao()
    for x in agentes + crons:
        w = em_manutencao(jan.get(x["id"], []), agora_s)
        x["manutencao"] = {"ate": ts_local(w[1])[:16], "motivo": w[2]} if w else None
        if w and x["status"] != "running":
            x["status_real"], x["status"] = x["status"], "manut"
            x["atrasado_s"], x["antigo"] = None, False
    # índice de sucesso no período (fora das janelas de manutenção): agentes pelo log; jobs pelas execuções que trabalharam ou falharam
    corte = agora_s - dias * 86400
    trab = {cid: [(iso_epoch(e["started_at"]), e["status"] == "failed", iso_epoch(e.get("finished_at"))) for e in ex
                  if e.get("started_at") and trabalhou(e)] for cid, ex in execs_cron}
    ep = lambda e: time.mktime(time.strptime(e["ts"], "%Y-%m-%d %H:%M:%S"))
    for a in agentes:
        execs = [(ep(e), e["code"] != 0) for e in por.get(a["id"], [])]
        job = cat.get(a["id"], {}).get("cron_job")
        c = next((x for x in crons if x["name"] == job), None) if job else None
        if c and not c["chama_agente"]:         # job que faz o trabalho do agente sem passar por ele: as rodadas dele são do agente
            execs += [(t, f) for t, f, _ in trab.get(c["id"], [])]
        a["sucesso"] = indice_sucesso(execs, jan.get(a["id"], []), corte)
        a["historico_desde"] = min([ts_local(t)[:10] for t, _ in execs] or [None]) if execs else None
    for c in crons:
        c["sucesso"] = indice_sucesso([(t, f) for t, f, _ in trab.get(c["id"], [])], jan.get(c["id"], []), corte)
        c["historico_desde"] = ts_local(min(t for t, _, _ in trab[c["id"]]))[:10] if trab.get(c["id"]) else None
    # tela JOBS: agendamento por extenso, próximas execuções (7 dias), execuções por dia e duração no período
    ini_dados = min((iso_epoch(e["started_at"]) for _, ex in execs_cron for e in ex if iso_epoch(e.get("started_at"))), default=None)
    dias_p = [(agora - timedelta(days=i)).date() for i in range(dias - 1, -1, -1)]
    por_nome = {jb.get("name"): jb for jb in CRON_JOBS_TODOS}
    for c in crons:
        sch = (por_nome.get(c["name"]) or {}).get("schedule") or {}
        expr = sch.get("expr") if sch.get("kind", "cron") == "cron" else None
        c["agenda_texto"] = agenda_texto(expr) if expr else (sch.get("display") or "")
        c["agenda_en"] = agenda_texto(expr, en=True) if expr else c["agenda_texto"]      # tela em inglês (?lang=en ou navegador)
        janelas = jan.get(c["id"], [])
        prox = []
        if c["enabled"] is not False and not c["paused"]:
            try:
                prox = proximas_execucoes(expr, agora_s, agora_s + PROXIMAS_DIAS * 86400) if expr else []
            except ValueError:
                prox = []
            if not prox:                   # agendamento que não é cron (intervalo) ou ilegível: fica a próxima do jobs.json
                nx = iso_epoch(c["next_run"])
                prox = [nx] if nx and agora_s - 3600 <= nx <= agora_s + PROXIMAS_DIAS * 86400 else []
        c["proximas"] = [[ts_local(t)[:16], bool(em_manutencao(janelas, t))] for t in prox]
        c["proximas_cortadas"] = len(prox) >= PROXIMAS_MAX
        por_dia = {d: [0, 0, 0] for d in dias_p}       # [OK, falhas, em manutenção]
        durs, ult = [], []
        for t, f, fim in sorted(trab.get(c["id"], []), key=lambda x: x[0] or 0):
            if not t or t < corte:
                continue
            m = bool(em_manutencao(janelas, t))
            d = datetime.fromtimestamp(t).date()
            if d in por_dia:
                por_dia[d][2 if m else 1 if f else 0] += 1
            if fim and not f and not m:
                durs.append(fim - t)
            ult.append([ts_local(t)[:16], round(fim - t) if fim else None, f, m])
        inicio = datetime.fromtimestamp(ini_dados).date() if ini_dados else None
        c["diario"] = [por_dia[d] if inicio and d >= inicio else None for d in dias_p]    # None = antes de haver dados
        c["duracao"] = {"media_s": round(sum(durs) / len(durs)) if durs else None, "max_s": round(max(durs)) if durs else None,
                        "n": len(durs), "soma_s": round(sum(durs))}
        c["ultimas"] = ult[-10:][::-1]
    # job que chama um agente: a falha que não chegou ao log de nenhum agente (caiu antes ou fora dele) conta no índice geral
    falhas_log = [ep(e) for e in hist if e["code"] != 0]
    falhas_fora = sum(1 for c in crons if c["chama_agente"] for t, f, fim in trab.get(c["id"], [])
                      if f and t >= corte and not em_manutencao(jan.get(c["id"], []), t)
                      and not any(t - 5 <= x <= (fim or t) + 60 for x in falhas_log))
    try:
        resp_padrao = ler_json(CONFIG).get("responsavel_padrao")
    except Exception:
        resp_padrao = None
    for x in agentes + crons:
        x["responsavel"] = (cat.get(x["id"], {}).get("responsavel") if x["kind"] == "agent" else None) or resp_padrao
    tend, tend_por = tendencia(hist, execs_cron, dias)
    if agora_s - _CUSTO.get(dias, (0,))[0] > 60:   # custo muda devagar: recalcula no máximo 1x por minuto (por período)
        _CUSTO[dias] = (agora_s, custos(hist, exs, dias))
    cst = _CUSTO[dias][1]
    nomes = (carregar_layout() or {}).get("nomes") or {}
    for x in agentes + crons:
        x["tendencia"] = tend_por.get(x["id"], [[0, 0]] * dias)
        x["titulo"] = nomes.get(x["id"]) or nomes.get(x.get("name"))
    for a in agentes:
        a["custo"] = cst.get(a["id"])
    concluidos.sort(key=lambda e: e["ts"], reverse=True)
    em_execucao.sort(key=lambda e: e["ts"], reverse=True)
    feed = em_execucao + concluidos[:40]      # sempre: todos os em execução + os 40 concluídos mais recentes
    todos = agentes + crons
    kp = {
        "running": sum(1 for x in todos if x["status"] == "running"),
        # agentes + jobs de cron SEM agente que trabalharam hoje (mesmo critério do feed); job que chama rodar_agente.py ou ligado por "cron_job" já conta pelo agente
        "runs_today": sum(x.get("runs_today", 0) for x in agentes) + sum(c["work_today"] for c in crons
                      if not c["chama_agente"] and not any(v.get("cron_job") == c["name"] for v in cat.values())),
        "errors_today": sum(x.get("errors_today", 0) for x in agentes) + sum(c["failed_today"] for c in crons),
        "in_error": sum(1 for x in todos if x["status"] == "error"),
        "late": sum(1 for x in todos if x.get("atrasado_s") and x["status"] != "error"),
        "stuck": sum(1 for x in agentes if x["status"] == "running" and (x.get("sem_acao_s") or 0) >= SEM_ACAO_S and not x.get("manutencao")),
        "manut": sum(1 for x in todos if x.get("manutencao")),
        "agents": len(agentes), "crons": len(crons),
        "last_activity": feed[0]["ts"] if feed else None,
        "tendencia": tend,
        "custo_usd": round(sum(x["custo_usd"] for x in cst.values()), 2) if cst else None,
        "sucesso": indice_geral(agentes, crons, cat, falhas_fora),
        "eventos_executor": bool(exs),
        "jobs_dados_desde": ts_local(ini_dados)[:10] if ini_dados else None,
    }
    vigia_saude(agora_s)
    arquivos_faltando(cat, CRON_JOBS_TODOS)
    est_equipe, equipe = equipe_painel()
    layout, origem = montar_layout(cat, [c["id"] for c in crons], [p["id"] for p in est_equipe])
    jarvis = jarvis_estado()
    for x in todos + [jarvis] + est_equipe:
        z, motivo = origem.get(x["id"], ("", ""))
        x["setor"], x["setor_motivo"] = z, motivo
    sem_setor = [i for i, (z, m) in origem.items() if m.startswith("padrão")]
    return {"now": agora.strftime("%Y-%m-%d %H:%M:%S"), "agents": agentes, "crons": crons,
            "feed": feed, "kpis": kp, "layout": layout, "sem_setor": sem_setor, "jarvis": jarvis, "claude_usage": claude_uso(), "vault": vault_painel(), "equipe_estacao": est_equipe, "equipe": equipe,
            "saude": list(SAUDE), "periodo_dias": dias, "versao": 4}


def atividade(agente):
    """Últimas ferramentas chamadas pelo agente (só NOME da ferramenta e hora; nunca argumentos, comandos nem respostas).
    O state.db não registra qual agente abriu a sessão: o vínculo é aproximado, por modelo + horário de início."""
    cat = ler_json(AGENTES)
    if agente not in cat:
        return {"erro": "agente desconhecido", "erro_en": "unknown agent"}
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
        return {"erro": "state.db indisponível", "erro_en": "state.db unavailable"}
    return {"agent": agente, "live": ao_vivo, "total": len(ev), "events": ev[-15:], "sessao": sid[:15],
            "parado_ha_s": int(agora - ultima) if (ao_vivo and ultima) else None}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype):
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass                      # navegador fechou a aba no meio da resposta: nada a fazer

    def host_ok(self):
        # Só atende quem chama pelo próprio computador. Bloqueia "DNS rebinding": um site de fora que aponta o próprio nome
        # para 127.0.0.1 e tenta ler a API pelo navegador de quem está com a Sala aberta.
        h = (self.headers.get("Host") or "").lower()
        porta = self.server.server_address[1]
        return h in ("127.0.0.1:%d" % porta, "localhost:%d" % porta, "127.0.0.1", "localhost", "[::1]:%d" % porta)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        p = self.path.split("?")[0]
        if not self.host_ok():
            self._send(403, b"acesso so por 127.0.0.1 ou localhost", "text/plain; charset=utf-8")
            return
        try:
            if p == "/api/state":
                from urllib.parse import urlparse, parse_qs
                try:
                    dias = int((parse_qs(urlparse(self.path).query).get("dias") or ["7"])[0])
                except ValueError:
                    dias = 7
                self._send(200, estado_json(dias if dias in PERIODOS else 7), "application/json; charset=utf-8")
            elif p == "/api/atividade":
                from urllib.parse import urlparse, parse_qs
                ag = (parse_qs(urlparse(self.path).query).get("agent") or [""])[0]
                self._send(200, json.dumps(atividade(ag), ensure_ascii=False).encode("utf8"), "application/json; charset=utf-8")
            elif p in ("/", "/index.html"):
                self._send(200, pagina_montada(), "text/html; charset=utf-8")
            elif p == "/3d":                   # endereço antigo do protótipo 3D: o 3D agora é um tema da própria Sala
                self.send_response(302)
                self.send_header("Location", "/?tema=3d" + ("&" + self.path.split("?", 1)[1] if "?" in self.path else ""))
                self.send_header("Content-Length", "0")
                self.end_headers()
            elif p.startswith("/web/"):
                arq = arquivo_web(p)
                if arq:
                    self._send(200, open(arq, "rb").read(), TIPOS_WEB[os.path.splitext(arq)[1]])
                else:
                    self._send(404, b"not found", "text/plain")
            else:
                self._send(404, b"not found", "text/plain")
        except Exception as e:
            self._send(500, ("erro: %s" % e).encode("utf8"), "text/plain; charset=utf-8")


WEB = os.path.join(AQUI, "web")        # CSS e JS da página (index.html), inclusive o tema 3D e o Three.js
TIPOS_WEB = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
             ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain; charset=utf-8"}


def pagina_montada():
    """index.html com o CSS e os scripts de web/ embutidos (um documento só). O código fica separado por assunto em web/,
    mas o navegador recebe tudo de uma vez: sem corrida entre arquivos (o Chrome headless dos testes às vezes salvava
    a página antes de baixar os scripts) e com um pedido só. Cada script leva //# sourceURL para o erro citar o arquivo."""
    html = open(os.path.join(AQUI, "index.html"), encoding="utf8").read()

    def conteudo(caminho):
        arq = arquivo_web(caminho)
        return open(arq, encoding="utf8").read().replace("</script", "<\\/script") if arq else None

    def css(m):
        txt = conteudo(m.group(1))
        return m.group(0) if txt is None else "<style>\n" + txt + "</style>"

    def js(m):
        txt = conteudo(m.group(1))
        return m.group(0) if txt is None else "<script>\n" + txt + "\n//# sourceURL=" + m.group(1) + "\n</script>"
    html = re.sub(r'<link rel="stylesheet" href="(/web/[^"]+\.css)">', css, html)
    html = re.sub(r'<script src="(/web/[^"]+\.js)"></script>', js, html)
    return html.encode("utf8")


def arquivo_web(caminho):
    """Arquivo pedido em /web/... só se estiver DENTRO da pasta web/ (sem ../ nem link para fora) e for de um tipo da lista."""
    from urllib.parse import unquote
    alvo = os.path.realpath(os.path.join(WEB, unquote(caminho[len("/web/"):])))
    if not alvo.startswith(os.path.realpath(WEB) + os.sep) or os.path.splitext(alvo)[1] not in TIPOS_WEB or not os.path.isfile(alvo):
        return None
    return alvo


if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print("Sala de Operações em http://127.0.0.1:%d" % porta, flush=True)
    ThreadingHTTPServer(("127.0.0.1", porta), H).serve_forever()
