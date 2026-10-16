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
                                                      "VAULT_CONT", "CLAUDE_USO", "rodando_agora", "sem_acao")}
        os.makedirs(os.path.join(self.tmp, "logs"))
        server.AGENTES = os.path.join(self.tmp, "agentes.json")
        server.LOGS = os.path.join(self.tmp, "logs")
        server.JOBS = os.path.join(self.tmp, "jobs.json")
        server.EXEC_DB = os.path.join(self.tmp, "nao_existe.db")
        server.STATE_DB = os.path.join(self.tmp, "nao_existe_state.db")
        server.EQUIPE_JSON = os.path.join(self.tmp, "equipe.json")
        server.VAULT_CONT = os.path.join(self.tmp, "vault.json")
        server.CLAUDE_USO = os.path.join(self.tmp, "claude.json")
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

    def estado(self):
        del server.SAUDE[:]
        return json.loads(json.dumps(server.estado()))     # mesmo caminho do /api/state (tem de ser serializável)


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
        server._CUSTO[0] = 0
        c = next(x for x in self.estado()["agents"] if x["id"] == "consulta_a")["custo_7d"]
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
        server._CACHE[0] = 0
        self.assertEqual(self.codigo("/api/state"), 200)
        self.assertEqual(self.codigo("/api/state", host="site-de-fora.exemplo"), 403)
        for c in ("/web/../server.py", "/web/%2e%2e/server.py", "/web/js/../../layout.json"):
            self.assertEqual(self.codigo(c), 404, c)
        with urllib.request.urlopen(self.url + "/api/atividade?agent=../../etc", timeout=5) as r:
            corpo = r.read().decode()
        self.assertIn("desconhecido", corpo)


if __name__ == "__main__":
    unittest.main(verbosity=1)
