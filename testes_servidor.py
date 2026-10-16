#!/usr/bin/env python3
"""Testes rápidos da lógica do servidor da Sala de Operações (sem navegador, ~1 s).

    python3 testes_servidor.py

Cada teste monta um ~/.hermes fictício numa pasta temporária (catálogo, logs de agente, jobs do cron, equipe) e aponta o
server.py para ele: nada real é lido nem alterado. Cobre o que a tela não prova sozinha: status a partir do código de
saída, fallback, feed coerente com o código, job e agente ATRASADO, agente antigo, rodando agora, contrato do /api/state,
nenhum dado por pessoa da equipe e as travas do servidor (Host de fora, caminhos fora de web/, agente desconhecido).
O testar_sala.py roda estes testes antes da parte visual.
"""
import json, os, sys, tempfile, threading, time, unittest, urllib.request, urllib.error
from datetime import datetime, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import server  # noqa: E402


def ts(delta_s):
    return (datetime.now() - timedelta(seconds=delta_s)).strftime("%Y-%m-%d %H:%M:%S")


def iso(delta_s):
    return (datetime.now().astimezone() - timedelta(seconds=delta_s)).isoformat()


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="sala_teste_")
        self.orig = {k: getattr(server, k) for k in ("AGENTES", "LOGS", "JOBS", "EXEC_DB", "STATE_DB", "EQUIPE_JSON",
                                                      "VAULT_CONT", "CLAUDE_USO", "rodando_agora", "sem_acao",
                                                      "HIST_CRON", "MANUT", "CONFIG", "VIGIA", "acordou_ha", "chama_agente", "SCRIPTS_DIR")}
        os.makedirs(os.path.join(self.tmp, "logs"))
        server.AGENTES = os.path.join(self.tmp, "agentes.json")
        server.LOGS = os.path.join(self.tmp, "logs")
        server.JOBS = os.path.join(self.tmp, "jobs.json")
        server.EXEC_DB = os.path.join(self.tmp, "nao_existe.db")
        server.STATE_DB = os.path.join(self.tmp, "nao_existe_state.db")
        server.EQUIPE_JSON = os.path.join(self.tmp, "equipe.json")
        server.VAULT_CONT = os.path.join(self.tmp, "vault.json")
        server.CLAUDE_USO = os.path.join(self.tmp, "claude.json")
        server.HIST_CRON = os.path.join(self.tmp, "historico_cron.jsonl")
        server.MANUT = os.path.join(self.tmp, "manutencao.json")
        server.CONFIG = os.path.join(self.tmp, "sala_config.json")
        server.VIGIA = os.path.join(self.tmp, "sala_vigia.json")
        server.acordou_ha = lambda: None
        server.SCRIPTS_DIR = os.path.join(self.tmp, "scripts")        # não existe: a checagem de arquivos fica desligada
        server._CUSTO.clear()
        server.rodando_agora = lambda: dict(self.rodando)
        server.sem_acao = lambda modelo, inicio: self.sem_acao
        server._cache_logs.clear()
        self.rodando, self.sem_acao = {}, None
        self.catalogo({"consulta_a": {"modelo": "m1"}, "consulta_b": {"modelo": "m2"}})
        self.jobs([])

    def tearDown(self):
        for k, v in self.orig.items():
            setattr(server, k, v)
        del server.SAUDE[:]

    def gravar(self, caminho, obj):
        with open(caminho, "w", encoding="utf8") as f:
            json.dump(obj, f)

    def catalogo(self, cat):
        self.gravar(server.AGENTES, cat)

    def jobs(self, lista):
        self.gravar(server.JOBS, {"jobs": lista})

    def log(self, nome, linhas):
        with open(os.path.join(server.LOGS, nome + ".log"), "w", encoding="utf8") as f:
            for quando, agente, modelo, codigo, aviso in linhas:
                f.write("===== %s · [Agente %s · modelo: %s%s] · código %d\nsaída qualquer\n" % (
                    quando, agente, modelo, " · ATENÇÃO: usou o modelo reserva" if aviso else "", codigo))

    def estado(self, dias=7):
        del server.SAUDE[:]
        return json.loads(json.dumps(server.estado(dias)))     # mesmo caminho do /api/state (tem de ser serializável)


class Status(Base):
    def test_status_pelo_codigo_e_fallback(self):
        self.log("a", [(ts(3600), "consulta_a", "m1", 0, False), (ts(60), "consulta_a", "m1", 0, True)])
        self.log("b", [(ts(120), "consulta_b", "m2", 3, False)])
        s = self.estado()
        ag = {a["id"]: a for a in s["agents"]}
        self.assertEqual(ag["consulta_a"]["status"], "ok")
        self.assertTrue(ag["consulta_a"]["last"]["fallback"])
        self.assertEqual(ag["consulta_b"]["status"], "error")
        self.assertEqual(s["kpis"]["in_error"], 1)
        for e in s["feed"]:                                   # feed: status sempre coerente com o código de saída
            self.assertEqual(e.get("status", "running" if e.get("running") else None) in ("ok", "running") , e["code"] == 0)

    def test_rodando_agora(self):
        self.log("a", [(ts(3600), "consulta_a", "m1", 0, False)])
        self.rodando, self.sem_acao = {"consulta_a": 42}, 400
        s = self.estado()
        a = next(x for x in s["agents"] if x["id"] == "consulta_a")
        self.assertEqual(a["status"], "running")
        self.assertEqual(a["elapsed_s"], 42)
        self.assertEqual(s["kpis"]["running"], 1)
        self.assertEqual(s["kpis"]["stuck"], 1)               # rodando sem ação há 400 s (limite 300)
        self.assertTrue(s["feed"][0]["running"])

    def test_contrato(self):
        s = self.estado()
        self.assertIsInstance(s["layout"]["zones"], list)
        for k in ("agents", "crons", "feed", "kpis", "saude"):
            self.assertIn(k, s)
        for k in ("running", "runs_today", "errors_today", "in_error", "late", "stuck"):
            self.assertIn(k, s["kpis"])


class Atraso(Base):
    def job(self, nome, prox_s, **extra):
        j = {"id": nome, "name": nome, "enabled": True, "schedule": {"expr": "0 * * * *"},
             "next_run_at": iso(prox_s), "last_run_at": iso(prox_s + 3600), "last_status": "ok", "script": "x.py"}
        j.update(extra)
        return j

    def test_job_atrasado(self):
        self.jobs([self.job("atrasado", 3600), self.job("em-dia", -1800), self.job("tolerancia", 120),
                   self.job("pausado", 7200, paused_at=iso(9000)), self.job("desligado", 7200, enabled=False),
                   self.job("com-falha", 7200, last_status="error")])
        s = self.estado()
        c = {x["name"]: x for x in s["crons"]}
        self.assertGreater(c["atrasado"]["atrasado_s"], 3500)
        self.assertEqual(c["atrasado"]["status"], "ok")
        for n in ("em-dia", "tolerancia", "pausado", "desligado"):
            self.assertIsNone(c[n]["atrasado_s"], n)
        self.assertEqual(c["pausado"]["status"], "idle")
        self.assertEqual(c["com-falha"]["status"], "error")
        self.assertEqual(s["kpis"]["late"], 1)               # o job com falha conta como falha, não como atrasado
        self.assertTrue(all("_execs" not in x for x in s["crons"]))

    def test_agente_cadencia_e_antigo(self):
        self.catalogo({"diario": {"modelo": "m", "cadencia_h": 24}, "diario_ok": {"modelo": "m", "cadencia_h": 24},
                       "sob_demanda": {"modelo": "m"}, "nunca": {"modelo": "m", "cadencia_h": 24}})
        self.log("x", [(ts(3 * 86400), "diario", "m", 0, False), (ts(3600), "diario_ok", "m", 0, False),
                       (ts(10 * 86400), "sob_demanda", "m", 0, False)])
        s = self.estado()
        a = {x["id"]: x for x in s["agents"]}
        self.assertGreater(a["diario"]["atrasado_s"], 86400)
        self.assertIsNone(a["diario_ok"]["atrasado_s"])
        self.assertIsNone(a["sob_demanda"]["atrasado_s"])      # sem cadência: nunca atrasado, só "antigo"
        self.assertTrue(a["sob_demanda"]["antigo"])
        self.assertFalse(a["diario_ok"]["antigo"])
        self.assertTrue(a["nunca"]["atrasado_s"])               # com cadência e sem nenhuma execução
        self.assertEqual(s["kpis"]["late"], 2)

    def test_datas(self):
        self.assertAlmostEqual(server.iso_epoch("2026-10-15T15:20:00-03:00"), 1792088400.0)
        self.assertIsNone(server.iso_epoch("lixo"))
        self.assertEqual(server.etime_s("1-02:03:04"), 93784)
        self.assertEqual(server.etime_s("03:04"), 184)


class Executor(Base):
    """Eventos de início e fim gravados pelo rodar_agente.py (Fase 5)."""
    def eventos(self, linhas):
        with open(os.path.join(server.LOGS, "eventos.jsonl"), "w", encoding="utf8") as f:
            for d in linhas:
                f.write(json.dumps(d) + "\n")

    def test_rodando_pelo_evento_e_interrompida(self):
        agora = time.time()
        self.log("a", [(ts(600), "consulta_a", "m1", 0, False)])
        self.eventos([
            {"ev": "inicio", "agente": "consulta_a", "pid": 999991, "t": agora - 700},                    # par do log: dá a duração
            {"ev": "fim", "agente": "consulta_a", "pid": 999991, "t": agora - 600, "codigo": 0, "duracao_s": 100, "sessoes": []},
            {"ev": "inicio", "agente": "consulta_b", "pid": 999992, "t": agora - 300},                    # morto por sinal, sem log
            {"ev": "fim", "agente": "consulta_b", "pid": 999992, "t": agora - 290, "codigo": 143, "duracao_s": 10, "sessoes": []},
            {"ev": "inicio", "agente": "consulta_b", "pid": os.getpid(), "t": agora - 42},                # processo vivo: rodando
            {"ev": "inicio", "agente": "desconhecido", "pid": 999993, "t": agora - 50},                   # fora do catálogo: ignorado
            "lixo"])
        s = self.estado()
        a = {x["id"]: x for x in s["agents"]}
        self.assertEqual(a["consulta_a"]["last"]["dur"], 100)
        self.assertEqual(a["consulta_b"]["status"], "running")
        self.assertGreaterEqual(a["consulta_b"]["elapsed_s"], 42)
        inter = [e for e in s["feed"] if e.get("interrompida")]
        self.assertEqual(len(inter), 1)
        self.assertEqual(inter[0]["code"], 143)
        self.assertEqual(inter[0]["status"], "error")
        self.assertTrue(s["kpis"]["eventos_executor"])
        self.assertNotIn("desconhecido", json.dumps(s["agents"]))

    def test_embrulho_registrar_execucao(self):
        """registrar_execucao.py (agentes sem o Hermes, ex.: Claude Code): OK, falha e a saída do comando nunca gravada."""
        import subprocess
        server.LOGS = os.path.join(self.tmp, ".hermes", "data", "agentes")          # onde o embrulho grava, com HOME = pasta do teste
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "registrar_execucao.py")
        rodar = lambda *a: subprocess.run([sys.executable, script] + list(a), env=dict(os.environ, HOME=self.tmp, SALA_AGENTES=server.AGENTES),
                                          capture_output=True, text=True)       # processo próprio, como no uso real
        ok = rodar("consulta_a", "--modelo", "m1", "--", sys.executable, "-c", "print('resposta-secreta')")
        falha = rodar("consulta_b", "--", sys.executable, "-c", "raise SystemExit(3)")
        self.assertEqual((ok.returncode, falha.returncode), (0, 3))
        self.assertIn("resposta-secreta", ok.stdout)                                  # a saída aparece no terminal...
        self.assertEqual(rodar("consulta_a").returncode, 2)                          # sem "--": só mostra o uso
        s = self.estado()
        a = {x["id"]: x for x in s["agents"]}
        self.assertEqual(a["consulta_a"]["status"], "ok")
        self.assertEqual(a["consulta_a"]["last"]["model"], "m1")
        self.assertIsNotNone(a["consulta_a"]["last"].get("dur"))
        self.assertEqual(a["consulta_b"]["status"], "error")
        gravado = "".join(open(os.path.join(server.LOGS, f), encoding="utf8").read() for f in os.listdir(server.LOGS))
        self.assertNotIn("resposta-secreta", gravado)                                  # ...mas nunca é gravada
        fora = rodar("consulta_inexistente", "--", sys.executable, "-c", "print('nao-devia-rodar')")
        self.assertEqual(fora.returncode, 2)                                          # fora do catálogo: recusa...
        self.assertIn("desconhecido", fora.stderr)
        self.assertNotIn("nao-devia-rodar", fora.stdout)                             # ...sem rodar o comando...
        self.assertFalse(os.path.exists(os.path.join(server.LOGS, "consulta_inexistente.log")))
        with open(os.path.join(server.LOGS, "eventos.jsonl"), encoding="utf8") as f:
            self.assertNotIn("consulta_inexistente", f.read())                       # ...e sem registrar nada

    def test_custo_exato_pelo_evento(self):
        import sqlite3
        server.STATE_DB = os.path.join(self.tmp, "state.db")
        con = sqlite3.connect(server.STATE_DB)
        con.execute("create table sessions (id text, source text, model text, started_at real, ended_at real, estimated_cost_usd real, input_tokens int, output_tokens int)")
        agora = time.time()
        con.executemany("insert into sessions values (?,?,?,?,?,?,?,?)", [
            ("s1", "oneshot", "m1", agora - 400, agora - 390, 0.01, 100, 20),
            ("s2", "oneshot", "m1", agora - 390, agora - 300, 0.50, 5000, 700),
            ("s3", "oneshot", "m1", agora - 90000, agora - 89000, 9.0, 1, 1)])     # fora dos 7 dias? não: 1 dia; não é desta execução
        con.commit(); con.close()
        self.log("a", [(ts(300), "consulta_a", "m1", 0, False)])
        self.eventos([{"ev": "inicio", "agente": "consulta_a", "pid": 999991, "t": agora - 400},
                      {"ev": "fim", "agente": "consulta_a", "pid": 999991, "t": agora - 300, "codigo": 0, "duracao_s": 100, "sessoes": ["s1", "s2"]}])
        server._CUSTO.clear()
        c = next(x for x in self.estado()["agents"] if x["id"] == "consulta_a")["custo"]
        self.assertEqual(c["tokens"], 5820)
        self.assertAlmostEqual(c["custo_usd"], 0.51)
        self.assertFalse(c["aprox"])

    def test_tendencia_nomes_e_dias_uteis(self):
        self.log("a", [(ts(86400 * 2), "consulta_a", "m1", 0, False), (ts(60), "consulta_a", "m1", 3, False), (ts(9 * 86400), "consulta_a", "m1", 0, False)])
        s = self.estado()
        t = s["kpis"]["tendencia"]
        self.assertEqual(len(t), 7)
        self.assertEqual((t[-1]["execucoes"], t[-1]["falhas"]), (1, 1))
        self.assertEqual(sum(x["execucoes"] for x in t), 2)                   # a de 9 dias atrás fica fora
        self.assertEqual(next(x for x in s["agents"] if x["id"] == "consulta_a")["tendencia"][-1], [1, 1])
        sexta = datetime(2026, 10, 16, 12).timestamp(); segunda = datetime(2026, 10, 19, 12).timestamp()
        self.assertAlmostEqual(server.uteis_s(sexta, segunda), 86400, delta=3700)    # sábado e domingo não contam (1 h de folga: horário de verão)


class Indicadores(Base):
    """Período (7 a 90 dias), índice de sucesso, histórico próprio dos jobs, manutenção e responsável (16/10/2026)."""

    def job(self, nome="rotina", **extra):
        j = {"id": "j-" + nome, "name": nome, "enabled": True, "schedule": {"expr": "0 * * * *"}, "next_run_at": iso(-1800),
             "last_run_at": iso(1800), "last_status": "ok", "script": "x.py"}
        j.update(extra)
        return j

    def hist_cron(self, linhas):
        with open(server.HIST_CRON, "w", encoding="utf8") as f:
            for jid, st, ini_s, dur_s in linhas:
                f.write(json.dumps({"job_id": jid, "job": "", "status": st, "started_at": iso(ini_s), "finished_at": iso(ini_s - dur_s)}) + "\n")

    def test_agenda_e_proximas_execucoes(self):
        A = server.agenda_texto
        self.assertEqual(A("20 8-17 * * 1,4"), "seg e qui, de hora em hora, das 8h20 às 17h20")
        self.assertEqual(A("30 8-17 * * 1-5"), "dias úteis, de hora em hora, das 8h30 às 17h30")
        self.assertEqual(A("0 12 * * 1-5"), "dias úteis, às 12h")
        self.assertEqual(A("0 9 * * 1"), "toda segunda-feira, às 9h")
        self.assertEqual(A("*/15 * * * *"), "todo dia, a cada 15 min")
        self.assertEqual(A("0 3 1,15 * *"), "todo dia 1 e 15 do mês, às 3h")
        self.assertEqual(A("30 6 * * 0,6"), "sábado e domingo, às 6h30")
        self.assertEqual(A("0 9 * 2 *"), "cron 0 9 * 2 *")                       # o que não sabe dizer, mostra a expressão
        self.assertEqual(A("99 * * * *"), "cron 99 * * * *")                     # inválida não derruba nada
        E = lambda e: server.agenda_texto(e, en=True)                              # tela em inglês
        self.assertEqual(E("20 8-17 * * 1,4"), "Mon and Thu, every hour, 08:20 to 17:20")
        self.assertEqual(E("0 12 * * 1-5"), "weekdays, at 12:00")
        self.assertEqual(E("0 9 * * 1"), "every Monday, at 09:00")
        self.assertEqual(E("0 3 1,15 * *"), "on days 1 and 15 of the month, at 03:00")
        self.assertEqual(E("0 3 5 * *"), "on day 5 of the month, at 03:00")
        self.assertEqual(E("15 * * * *"), "every day, every hour (at :15)")
        self.assertEqual(E("0 8,12,18 * * 0,6"), "Saturday and Sunday, at 08:00, 12:00 and 18:00")
        self.assertEqual(E("0 9 * 2 *"), "cron 0 9 * 2 *")
        P = server.proximas_execucoes
        sexta = datetime(2026, 10, 16, 12, 30).timestamp()                        # sexta-feira 12:30
        semana = sexta + 7 * 86400
        self.assertEqual([datetime.fromtimestamp(t).strftime("%d %H:%M") for t in P("0 12 * * 1-5", sexta, semana)],
                         ["19 12:00", "20 12:00", "21 12:00", "22 12:00", "23 12:00"])   # hoje 12:00 já passou
        self.assertEqual(len(P("20 8-17 * * 1,4", sexta, semana)), 20)            # seg e qui, 10 por dia
        self.assertEqual(len(P("0 9 * * 1", sexta, semana)), 1)
        self.assertEqual(P("30 12 * * 5", sexta, semana)[0], sexta)              # no minuto exato conta
        nov = [datetime.fromtimestamp(t).day for t in P("0 0 1 * 5", datetime(2026, 11, 1).timestamp(), datetime(2026, 11, 30, 23).timestamp())]
        self.assertEqual(nov, [1, 6, 13, 20, 27])                                  # dia 1 OU sexta (regra do cron), não E
        self.assertEqual(len(P("* * * * *", sexta, semana)), server.PROXIMAS_MAX)  # teto por job
        with self.assertRaises(ValueError):
            P("0 25 * * *", sexta, semana)

    def test_fonte_com_problema_tem_texto_em_ingles(self):
        import ast
        arv = ast.parse(open(server.__file__, encoding="utf-8").read())
        chamadas = [n for n in ast.walk(arv) if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "problema"]
        self.assertGreater(len(chamadas), 10)
        sem = [n.lineno for n in chamadas if len(n.args) < 3]
        self.assertEqual(sem, [], "problema() sem o texto em inglês (linhas do server.py)")
        server.SAUDE.clear()
        server.problema("x", "texto", "text")
        server.problema("y", "só português")
        self.assertEqual(server.SAUDE, [{"fonte": "x", "msg": "texto", "msg_en": "text"}, {"fonte": "y", "msg": "só português", "msg_en": "só português"}])
        server.SAUDE.clear()

    def test_tela_jobs(self):
        agora = datetime.now()
        f = lambda h: (agora + timedelta(hours=h)).strftime("%Y-%m-%d %H:%M")
        self.jobs([self.job("rotina", schedule={"kind": "cron", "expr": "0 * * * *"}),
                   self.job("parada", schedule={"kind": "cron", "expr": "0 * * * *"}, paused_at=iso(60)),
                   self.job("intervalo", schedule={"kind": "interval", "display": "a cada 2 h"}, next_run_at=iso(-3600))])
        self.hist_cron([("j-rotina", "completed", 2 * 86400, 60), ("j-rotina", "completed", 2 * 86400 - 600, 120),
                        ("j-rotina", "failed", 86400, 3), ("j-rotina", "completed", 1800, 90),
                        ("j-rotina", "completed", 3 * 86400, 1)])                 # 1 s: conferência, fora de tudo
        self.gravar(server.MANUT, {"janelas": [{"id": "cron:rotina", "de": f(-1), "ate": f(5)}]})
        s = self.estado(7)
        c = {x["name"]: x for x in s["crons"]}
        r = c["rotina"]
        self.assertEqual(r["agenda_texto"], "todo dia, de hora em hora")
        self.assertEqual(r["agenda_en"], "every day, every hour")
        self.assertEqual(c["intervalo"]["agenda_en"], "a cada 2 h")                # sem expressão cron: o texto do jobs.json
        self.assertIn(len(r["proximas"]), (168, 169))                              # 7 dias de hora em hora
        self.assertTrue(r["proximas"][0][1] and not r["proximas"][-1][1])          # as das próximas horas caem na janela de manutenção
        self.assertEqual(len(r["diario"]), 7)
        self.assertEqual(r["diario"][-1], [0, 0, 1])                               # a de 30 min atrás foi dentro da janela
        self.assertEqual(r["diario"][-2], [0, 1, 0])
        self.assertEqual(r["diario"][-3], [2, 0, 0])
        self.assertIsNone(r["diario"][0])                                          # antes do primeiro registro: sem dados (não é "nada rodou")
        self.assertEqual(r["duracao"], {"media_s": 90, "max_s": 120, "n": 2, "soma_s": 180})   # só OK e fora da manutenção
        self.assertEqual(len(r["ultimas"]), 4)
        self.assertTrue(r["ultimas"][0][3])                                         # a mais recente: em manutenção
        self.assertEqual(c["parada"]["proximas"], [])                              # pausado não tem próximas
        self.assertEqual(c["intervalo"]["agenda_texto"], "a cada 2 h")             # agendamento que não é cron: texto do jobs.json
        self.assertEqual(len(c["intervalo"]["proximas"]), 1)                       # e a próxima do jobs.json
        self.assertEqual(s["kpis"]["jobs_dados_desde"], (agora - timedelta(days=3)).strftime("%Y-%m-%d"))
        self.assertEqual(s["versao"], 4)

    def test_periodo_e_indice_de_sucesso(self):
        self.log("a", [(ts(40 * 86400), "consulta_a", "m1", 0, False), (ts(10 * 86400), "consulta_a", "m1", 1, False),
                       (ts(2 * 86400), "consulta_a", "m1", 0, False)])
        for dias, esp in ((7, (1, 0, 100.0)), (15, (2, 1, 50.0)), (90, (3, 1, 66.7))):
            s = self.estado(dias)
            a = next(x for x in s["agents"] if x["id"] == "consulta_a")
            su = a["sucesso"]
            self.assertEqual((su["execucoes"], su["falhas"], su["pct"]), esp, dias)
            self.assertEqual(len(a["tendencia"]), dias)
            self.assertEqual(len(s["kpis"]["tendencia"]), dias)
            self.assertEqual(s["periodo_dias"], dias)
            self.assertEqual(s["kpis"]["sucesso"]["execucoes"], esp[0])
        b = next(x for x in self.estado(90)["agents"] if x["id"] == "consulta_b")
        self.assertIsNone(b["sucesso"]["pct"])                                   # sem execução: sem índice (não é 0% nem 100%)

    def test_historico_proprio_dos_jobs(self):
        self.jobs([self.job()])
        self.hist_cron([("j-rotina", "completed", 20 * 86400, 60), ("j-rotina", "failed", 3 * 86400, 2),
                        ("j-rotina", "completed", 5 * 86400, 1)])                 # 1 s: só checou se era hora (não conta)
        for dias, esp in ((7, (1, 1)), (30, (2, 1))):
            c = self.estado(dias)["crons"][0]
            self.assertEqual((c["sucesso"]["execucoes"], c["sucesso"]["falhas"]), esp, dias)
            self.assertEqual(sum(x[0] for x in c["tendencia"]), esp[0])
        with open(server.HIST_CRON, "a", encoding="utf8") as f:
            f.write("linha quebrada\n")
        self.assertEqual(self.estado(30)["crons"][0]["sucesso"]["execucoes"], 2)  # linha ilegível é ignorada

    def test_manutencao(self):
        agora = datetime.now()
        f = lambda d: (agora + timedelta(hours=d)).strftime("%Y-%m-%d %H:%M")
        self.catalogo({"consulta_a": {"modelo": "m1"}, "consulta_b": {"modelo": "m2"}, "diario": {"modelo": "m", "cadencia_h": 24}})
        self.log("b", [(ts(3 * 86400), "consulta_b", "m2", 1, False), (ts(600), "consulta_b", "m2", 1, False)])
        self.log("d", [(ts(4 * 86400), "diario", "m", 0, False)])
        self.jobs([self.job("atrasado", next_run_at=iso(7200))])
        self.gravar(server.MANUT, {"janelas": [
            {"id": "consulta_b", "de": f(-1), "ate": f(24), "motivo": "troca de senha"},
            {"id": "diario", "de": f(-1), "ate": f(24)}, {"id": "cron:atrasado", "de": f(-1), "ate": f(24)},
            {"id": "consulta_a", "de": f(-48), "ate": f(-24)}]})                   # janela que já acabou: sem efeito
        s = self.estado()
        a = {x["id"]: x for x in s["agents"] + s["crons"]}
        self.assertEqual(a["consulta_b"]["status"], "manut")
        self.assertEqual(a["consulta_b"]["status_real"], "error")
        self.assertEqual(a["consulta_b"]["manutencao"]["motivo"], "troca de senha")
        self.assertEqual((a["consulta_b"]["sucesso"]["execucoes"], a["consulta_b"]["sucesso"]["manutencao"]), (1, 1))  # a falha de dentro da janela fica fora
        self.assertIsNone(a["diario"]["atrasado_s"])
        self.assertIsNone(a["cron:atrasado"]["atrasado_s"])
        self.assertIsNone(a["consulta_a"]["manutencao"])
        self.assertEqual((s["kpis"]["in_error"], s["kpis"]["late"], s["kpis"]["manut"]), (0, 0, 3))
        self.rodando = {"consulta_b": 30}                                         # rodando continua rodando, mesmo em manutenção
        self.assertEqual(next(x for x in self.estado()["agents"] if x["id"] == "consulta_b")["status"], "running")
        self.gravar(server.MANUT, {"janelas": [{"id": "consulta_b", "de": "ontem", "ate": f(1)}]})
        self.rodando = {}
        s = self.estado()
        self.assertEqual(next(x for x in s["agents"] if x["id"] == "consulta_b")["status"], "error")
        self.assertTrue(any(x["fonte"] == "manutenção" for x in s["saude"]))     # data inválida: avisa, não quebra

    def test_indice_sem_contar_duas_vezes(self):
        """Job ligado por cron_job que não passa pelo agente: rodadas dele são do agente. Job que chama agente: só a falha que
        não chegou ao log de nenhum agente entra no índice geral (a outra já está no log)."""
        server.chama_agente = lambda script: script == "roda_agente.py"
        self.catalogo({"auditoria": {"modelo": "m", "cron_job": "aud-job"}, "consulta_b": {"modelo": "m2"}})
        self.jobs([self.job("aud-job"), self.job("rateio", script="roda_agente.py")])
        self.log("a", [(ts(3600), "auditoria", "m", 0, False)])
        self.log("b", [(ts(7200 - 30), "consulta_b", "m2", 1, False)])       # falha do agente chamado pelo job de 2 h atrás
        self.hist_cron([("j-aud-job", "completed", 5000, 60), ("j-aud-job", "failed", 9000, 60),
                        ("j-rateio", "failed", 7200, 60), ("j-rateio", "failed", 20000, 60)])   # a 2ª falha não está no log
        s = self.estado()
        a = {x["id"]: x for x in s["agents"] + s["crons"]}
        self.assertEqual((a["auditoria"]["sucesso"]["execucoes"], a["auditoria"]["sucesso"]["falhas"]), (3, 1))
        self.assertEqual((a["cron:aud-job"]["sucesso"]["execucoes"], a["cron:rateio"]["sucesso"]["falhas"]), (2, 2))
        g = s["kpis"]["sucesso"]                                                   # auditoria 3 (1 falha) + consulta_b 1 (1 falha) + 1 falha fora do log
        self.assertEqual((g["execucoes"], g["falhas"]), (5, 3))
        self.assertEqual(a["cron:aud-job"]["historico_desde"], ts(9000)[:10])

    def test_vigia_parado_vira_fonte_com_problema(self):
        f = lambda: [x["fonte"] for x in self.estado()["saude"]]
        self.assertNotIn("vigia", f())                                              # sem vigia instalado: não é problema
        self.gravar(server.VIGIA, {"rodou_em": time.time() - 60, "erro": None})
        self.assertNotIn("vigia", f())
        self.gravar(server.VIGIA, {"rodou_em": time.time() - 3600, "erro": None})
        self.assertIn("vigia", f())
        server.acordou_ha = lambda: 120                                             # Mac acabou de acordar: espera o vigia rodar
        self.assertNotIn("vigia", f())
        server.acordou_ha = lambda: None
        self.gravar(server.VIGIA, {"rodou_em": time.time(), "erro": "o último e-mail de aviso não saiu"})
        self.assertIn("vigia", f())

    def test_arquivo_faltando_avisa_antes_da_falha(self):
        os.makedirs(os.path.join(server.SCRIPTS_DIR, "agente_x"))
        self.catalogo({"consulta_a": {"modelo": "m1", "prompt": "agente_x/prompt.md",
                                      "pos_validacao": {"script": os.path.join(server.SCRIPTS_DIR, "valida.py")}}})
        self.jobs([self.job("rotina", script="roda.py"), self.job("desligado", script="nao_existe.py", enabled=False),
                   self.job("govti-vault-contagem", script="oculto.py")])
        msg = lambda: " ".join(x["msg"] for x in self.estado()["saude"] if x["fonte"] == "arquivos")
        m = msg()
        for esperado in ("job rotina", "job govti-vault-contagem", "prompt do agente consulta_a", "pós-validação do agente consulta_a"):
            self.assertIn(esperado, m)
        self.assertNotIn("desligado", m)                                          # job desligado não roda: não acusa
        for f in ("roda.py", "oculto.py", "valida.py", "agente_x/prompt.md"):
            open(os.path.join(server.SCRIPTS_DIR, f), "w").close()
        self.assertEqual(msg(), "")

    def test_responsavel(self):
        self.catalogo({"consulta_a": {"modelo": "m1", "responsavel": "Pessoa B"}, "consulta_b": {"modelo": "m2"}})
        self.jobs([self.job()])
        s = self.estado()
        self.assertTrue(all(x["responsavel"] is None for x in s["agents"] if x["id"] != "consulta_a"))
        self.gravar(server.CONFIG, {"responsavel_padrao": "Pessoa A"})
        r = {x["id"]: x["responsavel"] for x in self.estado()["agents"] + self.estado()["crons"]}
        self.assertEqual(r, {"consulta_a": "Pessoa B", "consulta_b": "Pessoa A", "cron:rotina": "Pessoa A"})


class Vigia(Base):
    """vigia_sala.py: histórico próprio dos jobs e alerta por e-mail (himalaya falso, nada real é lido nem enviado)."""

    def setUp(self):
        super().setUp()
        import sqlite3
        # o vigia roda em processo próprio com HOME = pasta do teste: logs e banco do cron ficam onde ele procura
        server.LOGS = os.path.join(self.tmp, ".hermes", "data", "agentes")
        os.makedirs(server.LOGS)
        os.makedirs(os.path.join(self.tmp, ".hermes", "cron"))
        server.EXEC_DB = os.path.join(self.tmp, ".hermes", "cron", "executions.db")
        con = sqlite3.connect(server.EXEC_DB)
        con.execute("create table executions (job_id text, status text, pid int, started_at text, finished_at text, error text, claimed_at text)")
        con.executemany("insert into executions values (?,?,?,?,?,?,?)", [
            ("j-rotina", "completed", 1, iso(3600), iso(3500), None, iso(3600)),          # trabalhou 100 s
            ("j-rotina", "completed", 1, iso(1800), iso(1799.8), None, iso(1800)),        # só checou
            ("j-rotina", "failed", 1, iso(900), iso(899), "x", iso(900)),
            ("j-apoio", "completed", 1, iso(600), iso(500), None, iso(600)),               # job oculto da Sala
            ("j-sumiu", "failed", 1, iso(700), iso(690), "x", iso(700))])                  # job que não existe mais no jobs.json
        con.commit(); con.close()
        self.jobs([{"id": "j-rotina", "name": "rotina", "enabled": True, "schedule": {"expr": "0 * * * *"}, "script": "x.py",
                    "next_run_at": iso(-1800), "last_run_at": iso(900), "last_status": "ok"},
                   {"id": "j-apoio", "name": "govti-vault-contagem", "enabled": True, "schedule": {"expr": "*/5 * * * *"}, "script": "y.py"}])
        self.enviados = os.path.join(self.tmp, "enviados.txt")
        self.himalaya = os.path.join(self.tmp, "himalaya")
        with open(self.himalaya, "w") as f:
            f.write("#!/bin/sh\n[ -f %s/falhar ] && exit 1\necho '-----' >> %s\ncat >> %s\n" % (self.tmp, self.enviados, self.enviados))
        os.chmod(self.himalaya, 0o755)
        self.gravar(server.CONFIG, {"alerta_email": {"para": "alguem@exemplo.com", "de": "sala@exemplo.com", "himalaya": self.himalaya}})
        hoje = datetime.now()
        self.resumo = os.path.join(self.tmp, "resumo.json")                                # resumo desta semana já enviado
        self.gravar(self.resumo, {"semana": (hoje - timedelta(days=hoje.weekday())).strftime("%Y-%m-%d")})

    def vigia(self):
        import subprocess
        env = dict(os.environ, HOME=self.tmp, SALA_AGENTES=server.AGENTES, SALA_JOBS=server.JOBS, SALA_HIST_CRON=server.HIST_CRON,
                   SALA_MANUT=server.MANUT, SALA_CONFIG=server.CONFIG, SALA_ALERTA_BASE=os.path.join(self.tmp, "base.json"),
                   SALA_VIGIA=server.VIGIA, SALA_RESUMO=self.resumo)
        return subprocess.run([sys.executable, os.path.join(AQUI, "vigia_sala.py")], env=env, capture_output=True, text=True)

    def emails(self):
        return open(self.enviados, encoding="utf8").read().split("-----\n")[1:] if os.path.exists(self.enviados) else []

    def test_historico(self):
        r = self.vigia()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        h = [json.loads(l) for l in open(server.HIST_CRON, encoding="utf8")]
        self.assertEqual(sorted(x["status"] for x in h), ["completed", "failed"])   # sem a checagem de 0,2 s, o job oculto e o que sumiu
        with open(server.HIST_CRON, "a", encoding="utf8") as f:                     # linha antiga de job que não existe mais: sai
            f.write(json.dumps({"job_id": "j-sumiu", "job": "", "status": "failed", "started_at": iso(9000), "finished_at": iso(8990)}) + "\n")
        self.vigia()
        self.assertEqual(len(open(server.HIST_CRON, encoding="utf8").readlines()), 2)  # rodar de novo não duplica
        with open(server.HIST_CRON, "a", encoding="utf8") as f:                         # 120 dias atrás: descartada na próxima rodada
            f.write(json.dumps({"job_id": "j-rotina", "job": "rotina", "status": "completed", "started_at": iso(120 * 86400), "finished_at": iso(120 * 86400 - 60)}) + "\n")
        self.vigia()
        self.assertEqual(len(open(server.HIST_CRON, encoding="utf8").readlines()), 2)

    def test_alerta_por_email(self):
        self.log("a", [(ts(3600), "consulta_a", "m1", 0, False)])
        r = self.vigia()
        self.assertIn("base inicial", r.stdout)
        self.assertEqual(self.emails(), [])                                           # 1ª rodada: só a base
        self.log("a", [(ts(3600), "consulta_a", "m1", 0, False), (ts(60), "consulta_a", "m1", 2, False)])
        self.vigia()
        e = self.emails()
        self.assertEqual(len(e), 1)
        self.assertIn("Subject: [Sala] FALHA: consulta_a", e[0])
        self.assertIn("To: alguem@exemplo.com", e[0])
        self.assertNotIn("saída qualquer", e[0])                                      # nunca o conteúdo do log
        self.vigia()
        self.assertEqual(len(self.emails()), 1)                                       # nada novo: nada enviado
        self.log("a", [(ts(3600), "consulta_a", "m1", 0, False), (ts(60), "consulta_a", "m1", 2, False), (ts(5), "consulta_a", "m1", 0, False)])
        self.vigia()
        self.assertIn("Subject: [Sala] Normalizado: consulta_a", self.emails()[1])
        # em manutenção: falha não alerta
        self.gravar(server.MANUT, {"janelas": [{"id": "consulta_b", "de": "2000-01-01 00:00", "ate": "2999-01-01 00:00"}]})
        self.log("b", [(ts(4), "consulta_b", "m2", 1, False)])
        self.vigia()
        self.assertEqual(len(self.emails()), 2)
        # envio falhou: código 1 e a mesma novidade vai na rodada seguinte (30 min depois do último aviso da estação)
        b = json.load(open(os.path.join(self.tmp, "base.json"), encoding="utf8"))
        b["avisado"]["consulta_a"] -= 1801
        json.dump(b, open(os.path.join(self.tmp, "base.json"), "w", encoding="utf8"))
        open(os.path.join(self.tmp, "falhar"), "w").close()
        self.log("a", [(ts(3), "consulta_a", "m1", 5, False)])
        self.assertEqual(self.vigia().returncode, 1)
        os.remove(os.path.join(self.tmp, "falhar"))
        self.assertEqual(self.vigia().returncode, 0)
        self.assertIn("Subject: [Sala] FALHA: consulta_a", self.emails()[2])

    def test_um_aviso_por_estacao_a_cada_30_min(self):
        base = os.path.join(self.tmp, "base.json")
        L = [(ts(3600), "consulta_a", "m1", 0, False)]
        self.log("a", L); self.vigia()
        L.append((ts(300), "consulta_a", "m1", 2, False)); self.log("a", L); self.vigia()      # falha: avisa
        L.append((ts(200), "consulta_a", "m1", 0, False)); self.log("a", L); self.vigia()      # voltou: avisa na hora
        L.append((ts(100), "consulta_a", "m1", 3, False)); self.log("a", L); self.vigia()      # falhou de novo em < 30 min: espera
        e = self.emails()
        self.assertEqual([x.split("Subject: ")[1].split("\n")[0] for x in e], ["[Sala] FALHA: consulta_a", "[Sala] Normalizado: consulta_a"])
        self.vigia()
        self.assertEqual(len(self.emails()), 2)                                                 # continua esperando
        b = json.load(open(base, encoding="utf8"))
        b["avisado"]["consulta_a"] -= 1801                                                      # passaram os 30 min
        json.dump(b, open(base, "w", encoding="utf8"))
        self.vigia()
        self.assertIn("Subject: [Sala] FALHA: consulta_a", self.emails()[2])                   # a falha guardada sai agora

    def test_sinal_de_vida(self):
        self.vigia()
        v = json.load(open(server.VIGIA, encoding="utf8"))
        self.assertLess(time.time() - v["rodou_em"], 60)
        self.assertIsNone(v["erro"])
        self.log("a", [(ts(60), "consulta_a", "m1", 0, False)])
        self.vigia()                                                                            # (base)
        open(os.path.join(self.tmp, "falhar"), "w").close()
        self.log("a", [(ts(5), "consulta_a", "m1", 4, False)])
        self.vigia()
        self.assertIn("não saiu", json.load(open(server.VIGIA, encoding="utf8"))["erro"])
        self.assertIn("vigia", [x["fonte"] for x in self.estado()["saude"]])                    # a Sala acusa

    def test_agendar_mac_simular(self):
        import plistlib, subprocess
        env = dict(os.environ, HOME=self.tmp, SALA_LAUNCHD_PREFIXO="sala.teste")
        r = subprocess.run([sys.executable, os.path.join(AQUI, "agendar_mac.py"), "--simular", "--porta", "8799"],
                           env=env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        docs = ["<?xml" + x for x in r.stdout.split("<?xml")[1:]]
        p = [plistlib.loads(x.split("</plist>")[0].encode() + b"</plist>") for x in docs]
        self.assertEqual([x["Label"] for x in p], ["sala.teste.servidor", "sala.teste.vigia"])
        self.assertEqual(p[0]["ProgramArguments"][1:], [os.path.join(AQUI, "server.py"), "8799"])
        self.assertTrue(p[0]["KeepAlive"])
        self.assertEqual(p[1]["StartInterval"], 300)
        self.assertEqual(os.path.realpath(p[1]["ProgramArguments"][0]), os.path.realpath(sys.executable))
        self.assertTrue(p[1]["StandardErrorPath"].startswith(os.path.join(self.tmp, "Library", "Logs")))
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "Library", "LaunchAgents")))   # simular não grava

    def test_resumo_semanal(self):
        import vigia_sala
        d = lambda *a: datetime(*a)
        # 19/10/2026 é segunda-feira
        self.assertFalse(vigia_sala.resumo_devido(d(2026, 10, 19, 7, 59), "2026-10-12"))     # antes das 8h
        self.assertTrue(vigia_sala.resumo_devido(d(2026, 10, 19, 8, 0), "2026-10-12"))
        self.assertFalse(vigia_sala.resumo_devido(d(2026, 10, 19, 8, 5), "2026-10-19"))      # já saiu nesta semana
        self.assertTrue(vigia_sala.resumo_devido(d(2026, 10, 21, 10, 0), "2026-10-12"))      # Mac desligado na segunda: sai na quarta
        self.assertTrue(vigia_sala.resumo_devido(d(2026, 10, 21, 10, 0), None))
        self.log("a", [(ts(3600), "consulta_a", "m1", 0, False), (ts(600), "consulta_a", "m1", 2, False)])
        import subprocess
        env = dict(os.environ, HOME=self.tmp, SALA_CONFIG=server.CONFIG, SALA_AGENTES=server.AGENTES, SALA_JOBS=server.JOBS)
        r = subprocess.run([sys.executable, os.path.join(AQUI, "vigia_sala.py"), "--resumo"], env=env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        e = self.emails()[0]
        self.assertIn("Subject: [Sala] Resumo da semana: 50,0% OK", e)
        self.assertIn("consulta_a (consulta_a): 1 de 2", e)
        self.assertNotIn("saída qualquer", e)
        self.vigia()                                                                 # (base)
        os.remove(self.resumo)                                                       # semana sem resumo: a rodada normal manda
        self.vigia(); self.vigia()
        self.assertEqual(len(self.emails()), 2)                                      # um só, mesmo rodando duas vezes
        self.assertTrue(os.path.exists(self.resumo))

    def test_email_de_teste(self):
        import subprocess
        env = dict(os.environ, HOME=self.tmp, SALA_CONFIG=server.CONFIG, SALA_ALERTA_BASE=os.path.join(self.tmp, "base.json"))
        r = subprocess.run([sys.executable, os.path.join(AQUI, "vigia_sala.py"), "--teste"], env=env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("Subject: [Sala] Teste do aviso por e-mail", self.emails()[0])
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "base.json")))         # o teste não mexe na base

    def test_um_destinatario_so(self):
        self.gravar(server.CONFIG, {"alerta_email": {"para": "a@exemplo.com, b@exemplo.com", "himalaya": self.himalaya}})
        r = self.vigia()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("UM endereço", r.stdout + r.stderr)
        self.assertEqual(self.emails(), [])

    def test_sem_config_de_email(self):
        os.remove(server.CONFIG)
        r = self.vigia()
        self.assertEqual(r.returncode, 0)
        self.assertTrue(os.path.exists(server.HIST_CRON))                              # o histórico continua
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "base.json")))


class Manutencao(Base):
    def rodar(self, *a):
        import subprocess
        env = dict(os.environ, HOME=self.tmp, SALA_AGENTES=server.AGENTES, SALA_JOBS=server.JOBS, SALA_MANUT=server.MANUT)
        return subprocess.run([sys.executable, os.path.join(AQUI, "manutencao.py")] + list(a), env=env, capture_output=True, text=True)

    def test_iniciar_listar_encerrar(self):
        self.assertEqual(self.rodar("iniciar", "nao_existe", "--ate", "+2h").returncode, 2)
        self.assertEqual(self.rodar("iniciar", "consulta_a", "--ate", "amanhã").returncode, 2)
        r = self.rodar("iniciar", "consulta_a", "--ate", "+2d", "--motivo", "troca de senha")
        self.assertEqual(r.returncode, 0, r.stderr)
        s = self.estado()
        a = next(x for x in s["agents"] if x["id"] == "consulta_a")
        self.assertEqual(a["manutencao"]["motivo"], "troca de senha")
        self.assertIn("ATIVA", self.rodar("listar").stdout)
        self.assertEqual(self.rodar("encerrar", "consulta_a").returncode, 0)
        self.assertIsNone(next(x for x in self.estado()["agents"] if x["id"] == "consulta_a")["manutencao"])
        self.assertEqual(self.rodar("encerrar", "consulta_a").returncode, 1)


class Privacidade(Base):
    def test_equipe_formato_antigo_nao_vaza_pessoa(self):
        membros = [{"id": 901, "nome": "Pessoa1 Teste"}, {"id": 902, "nome": "Pessoa2 Teste"}]
        self.gravar(server.EQUIPE_JSON, {"updated_at": time.time(), "dia": time.strftime("%Y-%m-%d"), "membros": membros,
                                         "abertos": {"901": 10, "902": 20}, "encerrados_hoje": {"901": 1, "902": 2},
                                         "sem_responsavel": 3, "abertos_total": 30})
        corpo = json.dumps(self.estado(), ensure_ascii=False)
        for proibido in ("Pessoa1", "Pessoa2", '"membros":', '"pessoa:', "901", "902"):
            self.assertNotIn(proibido, corpo)
        self.assertIn('"encerrados": 3', corpo)                 # só a soma


class Servidor(Base):
    def setUp(self):
        super().setUp()
        self.srv = server.ThreadingHTTPServer(("127.0.0.1", 0), server.H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = "http://127.0.0.1:%d" % self.srv.server_address[1]

    def tearDown(self):
        self.srv.shutdown(); self.srv.server_close()
        super().tearDown()

    def codigo(self, caminho, host=None):
        req = urllib.request.Request(self.url + caminho, headers={"Host": host} if host else {})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status
        except urllib.error.HTTPError as e:
            e.close()
            return e.code

    def test_travas(self):
        server._CACHE.clear()
        self.assertEqual(self.codigo("/api/state"), 200)
        self.assertEqual(self.codigo("/api/state", host="site-de-fora.exemplo"), 403)
        for c in ("/web/../server.py", "/web/%2e%2e/server.py", "/web/js/../../layout.json"):
            self.assertEqual(self.codigo(c), 404, c)
        with urllib.request.urlopen(self.url + "/api/atividade?agent=../../etc", timeout=5) as r:
            corpo = r.read().decode()
        self.assertIn("desconhecido", corpo)


if __name__ == "__main__":
    unittest.main(verbosity=1)
