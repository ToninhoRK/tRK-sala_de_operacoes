#!/usr/bin/env python3
"""Teste automático da Sala de Operações (rodar antes de publicar ou depois de mexer na página/servidor).

Sobe o server.py DESTA pasta numa porta livre, em modo só leitura, e abre a página no Chrome headless com ?debug=1:
  - dados reais (ou os de exemplo/, sem Hermes), várias sementes e 15 min de simulação;
  - modo demonstração;
  - cenários fictícios (variáveis SALA_AGENTES/SALA_JOBS/SALA_EQUIPE, arquivos temporários; nada real é alterado):
    agente novo sem sala, cron com falha, equipe com 4 e com 6 pessoas.
Confere os contadores do diagnóstico (todos devem ser 0) e a API (contrato, bloqueio de Host de fora).
Saída: tabela + código 0 (tudo ok) ou 1 (algum problema).

Uso: python3 testar_sala.py [--rapido]      (--rapido: 1 semente e 5 min simulados por cenário)
Precisa do Google Chrome (variável CHROME para outro caminho).
"""
import os, re, sys, json, time, socket, shutil, tempfile, subprocess, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
CONTADORES = ("OVERLAPS", "ESTANTE_INVASOES", "ERROS", "VIDRO", "PAREDE", "ATRAVESSA", "EMPILHADOS", "ORDEM")
RAPIDO = "--rapido" in sys.argv


def porta_livre():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def subir(env_extra):
    porta = porta_livre()
    env = dict(os.environ, **env_extra)
    proc = subprocess.Popen(["/usr/bin/python3", os.path.join(AQUI, "server.py"), str(porta)], cwd=AQUI, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            urllib.request.urlopen("http://127.0.0.1:%d/api/state" % porta, timeout=2).read(); return proc, porta
        except Exception:
            time.sleep(0.2)
    proc.kill(); raise SystemExit("servidor de teste não subiu")


def pagina(porta, consulta, perfil):
    out = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-first-run", "--user-data-dir=" + perfil,
                          "--window-size=1920,1080", "--virtual-time-budget=30000", "--dump-dom",
                          "http://127.0.0.1:%d/?%s" % (porta, consulta)], capture_output=True, text=True, timeout=240).stdout
    m = re.search(r'<pre id="dbg">(.*?)</pre>', out, re.S)
    if not m:
        return None, "página sem diagnóstico (erro ao carregar?)"
    txt = m.group(1)
    vals = {}
    for c in CONTADORES:
        mm = re.search(r"^%s (\d+)" % c, txt, re.M)
        vals[c] = int(mm.group(1)) if mm else None
    # linhas de detalhe dos contadores não zerados (para o relatório)
    det = [l for l in txt.splitlines() if l.strip() and not re.match(r"^(%s) \d+" % "|".join(CONTADORES), l)
           and not re.match(r"^(WORKERS|TESTE)$", l) and not re.match(r"^\S+: (ok|running|error|idle) · ", l)
           and not l.startswith("<")]
    return vals, "\n".join(det[:12])


def api(porta):
    erros = []
    d = json.loads(urllib.request.urlopen("http://127.0.0.1:%d/api/state" % porta).read())
    if not isinstance(d["layout"]["zones"], list): erros.append("layout.zones não é lista")
    if any("_execs" in c for c in d["crons"]): erros.append("_execs vazou para o navegador")
    for x in d.get("saude") or []:
        erros.append("saúde das fontes acusou: " + x["msg"])     # sem Hermes não deve acusar nada; com Hermes, é problema real a olhar
    for e in d["feed"]:
        if e.get("status") and not e.get("running") and (e["status"] == "error") != (e.get("code") != 0):
            erros.append("feed com status incoerente: %s" % e); break
    req = urllib.request.Request("http://127.0.0.1:%d/api/state" % porta, headers={"Host": "site-de-fora.exemplo"})
    try:
        urllib.request.urlopen(req); erros.append("Host de fora foi atendido (deveria ser 403)")
    except urllib.error.HTTPError as e:
        if e.code != 403: erros.append("Host de fora: código %d (esperado 403)" % e.code)
    return erros, d


def cenario_arquivos(tmp, n_pessoas, base):
    """Catálogo real (ou de exemplo) + 2 agentes fictícios, jobs com 1 falha, equipe fictícia com n pessoas."""
    cat = dict(base["catalogo"])
    cat["zz_sem_sala_teste"] = {"descricao": "agente fictício sem sala (teste; nome fora de qualquer prefixo)", "modelo": "modelo-teste"}
    cat["consulta_teste"] = {"descricao": "agente fictício (teste)", "modelo": "modelo-teste"}   # nome de tamanho comum: nomes > ~18 letras em sala de 1 fileira podem encostar na mesa da sala vizinha (limitação conhecida)
    jobs = json.loads(json.dumps(base["jobs"]))
    lista = jobs["jobs"] if isinstance(jobs, dict) and "jobs" in jobs else jobs
    if lista:
        lista[0]["last_status"] = "error"
    hoje = time.strftime("%Y-%m-%d")
    membros = [{"id": 900 + i, "nome": "Pessoa%d Teste" % (i + 1)} for i in range(n_pessoas)]
    eq = {"updated_at": time.time(), "dia": hoje, "membros": membros,
          "abertos": {str(m["id"]): 10 * (i + 1) for i, m in enumerate(membros)},
          "encerrados_hoje": {str(m["id"]): i for i, m in enumerate(membros)},
          "sem_responsavel": 3, "abertos_total": sum(10 * (i + 1) for i in range(n_pessoas))}
    arq = {}
    for nome, obj in (("agentes.json", cat), ("jobs.json", jobs), ("equipe.json", eq)):
        p = os.path.join(tmp, "%d_%s" % (n_pessoas, nome)); json.dump(obj, open(p, "w")); arq[nome] = p
    return {"SALA_AGENTES": arq["agentes.json"], "SALA_JOBS": arq["jobs.json"], "SALA_EQUIPE": arq["equipe.json"]}


def main():
    if not os.path.exists(CHROME):
        raise SystemExit("Chrome não encontrado em %s (defina CHROME=...)" % CHROME)
    tmp = tempfile.mkdtemp(prefix="sala_teste_")
    perfil = os.path.join(tmp, "chrome")
    ff, sementes = ("300", [1]) if RAPIDO else ("900", [1, 2, 3])
    falhas, linhas = [], []
    try:
        proc, porta = subir({})
        try:
            erros, d = api(porta)
            falhas += ["API: " + e for e in erros]
            base = {"catalogo": json.load(open(os.environ.get("SALA_AGENTES") or _catalogo())),
                    "jobs": json.load(open(_jobs()))}
            casos = [("dados atuais · semente %d" % s, "debug=1&seed=%d&ff=%s" % (s, ff)) for s in sementes]
            casos.append(("demonstração", "debug=1&demo=1&seed=4&ff=%s&jarvis=running" % ff))
            for nome, q in casos:
                linhas.append((nome,) + _rodar(porta, q, perfil, falhas, nome))
        finally:
            proc.kill()
        for n in (4, 6):
            env = cenario_arquivos(tmp, n, base)
            proc, porta = subir(env)
            try:
                erros, d = api(porta)
                falhas += ["API (cenário %d pessoas): %s" % (n, e) for e in erros]
                if "zz_sem_sala_teste" not in d["sem_setor"]:
                    falhas.append("cenário: agente sem sala não foi para NOVOS AGENTES")
                nome = "cenário: agente novo + cron com falha + %d pessoas" % n
                linhas.append((nome,) + _rodar(porta, "debug=1&seed=5&ff=%s" % ff, perfil, falhas, nome))
            finally:
                proc.kill()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    larg = max(len(l[0]) for l in linhas)
    print("%-*s  %s" % (larg, "caso", "  ".join(c[:6] for c in CONTADORES)))
    for l in linhas:
        print("%-*s  %s" % (larg, l[0], "  ".join(("%6s" % ("?" if v is None else v)) for v in l[1])))
    if falhas:
        print("\nPROBLEMAS:"); [print(" -", f) for f in falhas]
        return 1
    print("\nOK: todos os contadores em 0, API coerente e Host de fora bloqueado.")
    return 0


def _rodar(porta, q, perfil, falhas, nome):
    vals, det = pagina(porta, q, perfil)
    if vals is None:
        falhas.append("%s: %s" % (nome, det)); return (tuple([None] * len(CONTADORES)),)
    ruins = [c for c in CONTADORES if vals[c] != 0]
    if ruins:
        falhas.append("%s: %s\n   %s" % (nome, ", ".join("%s=%s" % (c, vals[c]) for c in ruins), det.replace("\n", "\n   ")))
    return (tuple(vals[c] for c in CONTADORES),)


def _catalogo():
    p = os.path.expanduser("~/.hermes/scripts/agentes.json")
    return p if os.path.exists(p) else os.path.join(AQUI, "exemplo", "agentes.json")


def _jobs():
    p = os.path.expanduser("~/.hermes/cron/jobs.json")
    return p if os.path.exists(p) else os.path.join(AQUI, "exemplo", "cron_jobs.json")


if __name__ == "__main__":
    sys.exit(main())
