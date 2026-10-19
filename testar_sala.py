#!/usr/bin/env python3
"""Teste automático da Sala de Operações (rodar antes de publicar ou depois de mexer na página/servidor).

Sobe o server.py DESTA pasta numa porta livre, em modo só leitura, e abre a página no Chrome headless com ?debug=1:
  - dados reais (ou os de exemplo/, sem Hermes), várias sementes e 15 min de simulação;
  - modo demonstração;
  - cenários fictícios (variáveis SALA_AGENTES/SALA_JOBS/SALA_EQUIPE, arquivos temporários; nada real é alterado):
    agente novo sem sala, cron com falha, equipe no formato novo (só totais) e no antigo (por pessoa);
  - Modo TV, animação desligada + só rótulos de problema, rótulos nomes + rodando e falha, e o tema 3D (WebGL, estações,
    bonecos, texturas de parede, sombra, diagnóstico da planta com o 3D ligado, /3d redirecionando);
  - a rota de arquivos /web/ recusando caminhos para fora da pasta web/.
Confere os contadores do diagnóstico (todos devem ser 0, inclusive SOM = autoteste da lógica do som de alerta) e a API
(contrato, bloqueio de Host de fora e NENHUM nome ou número por pessoa da equipe chegando ao navegador).
Saída: tabela + código 0 (tudo ok) ou 1 (algum problema).

Uso: python3 testar_sala.py [--rapido]      (--rapido: 1 semente e 5 min simulados por cenário)
Precisa do Google Chrome (variável CHROME para outro caminho; CHROME_EXTRA para opções a mais, ex. "--no-sandbox" no
Linux do GitHub Actions, onde este teste roda a cada envio).
"""
import os, pwd, re, sys, json, time, socket, shutil, tempfile, subprocess, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
CHROME_EXTRA = os.environ.get("CHROME_EXTRA", "").split()
# servidor de teste no Python do sistema quando houver (no Mac, o 3.9: o mais antigo suportado); senão, o que roda este teste
PY_SERVIDOR = os.environ.get("SALA_PY") or ("/usr/bin/python3" if os.path.exists("/usr/bin/python3") else sys.executable)
CONTADORES = ("OVERLAPS", "ESTANTE_INVASOES", "ERROS", "VIDRO", "PAREDE", "ATRAVESSA", "EMPILHADOS", "ORDEM", "SOM")
RAPIDO = "--rapido" in sys.argv


def porta_livre():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def subir(env_extra):
    porta = porta_livre()
    env = {**os.environ, "SALA_VERSAO_REMOTA": "", **env_extra}     # sem rede nos testes; o caso da tarja de versão passa a sua
    proc = subprocess.Popen([PY_SERVIDOR, os.path.join(AQUI, "server.py"), str(porta)], cwd=AQUI, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            urllib.request.urlopen("http://127.0.0.1:%d/api/state" % porta, timeout=2).read(); return proc, porta
        except Exception:
            time.sleep(0.2)
    proc.kill(); raise SystemExit("servidor de teste não subiu")


FPS = {}


def pagina(porta, consulta, perfil, janela="1920,1080"):
    if "lang=" not in consulta:
        consulta += "&lang=pt"     # a língua segue o navegador (o Chrome de teste pode estar em inglês): sem lang=, testa o português
    out = subprocess.run([CHROME] + CHROME_EXTRA + ["--headless=new", "--disable-gpu", "--no-first-run", "--user-data-dir=" + perfil,
                          "--window-size=" + janela, "--virtual-time-budget=30000", "--dump-dom",
                          "http://127.0.0.1:%d/?%s" % (porta, consulta)], capture_output=True, text=True, timeout=240,
                         env=dict(os.environ, HOME=pwd.getpwuid(os.getuid()).pw_dir)).stdout   # Chrome sempre com o HOME real: com HOME vazio (teste "sem Hermes") ele trava ao abrir; o "sem Hermes" vale só para o servidor
    m = re.search(r'<pre id="dbg">(OVERLAPS .*?)</pre>', out, re.S)   # o relatório começa sempre por OVERLAPS (o código da página vem embutido no HTML)
    if not m:
        return None, "página sem diagnóstico (erro ao carregar?)"
    f = re.search(r'<span class="sub" id="k-fps"[^>]*>([^<]*)</span>', out)   # fps do card Operação (o valor real só se mede num navegador de verdade)
    FPS[consulta] = f.group(1) if f else None
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
    for caminho in ("/web/../server.py", "/web/%2e%2e/server.py", "/web/js/../../layout.json", "/web/vendor/three/../../../sala_config.py"):
        try:   # a rota de arquivos (/web/) não pode entregar nada fora da pasta web/
            urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:%d%s" % (porta, caminho))); erros.append("rota /web/ entregou " + caminho)
        except urllib.error.HTTPError as e:
            if e.code != 404: erros.append("rota /web/ com %s: código %d (esperado 404)" % (caminho, e.code))
    req = urllib.request.Request("http://127.0.0.1:%d/api/state" % porta, headers={"Host": "site-de-fora.exemplo"})
    try:
        urllib.request.urlopen(req); erros.append("Host de fora foi atendido (deveria ser 403)")
    except urllib.error.HTTPError as e:
        if e.code != 403: erros.append("Host de fora: código %d (esperado 403)" % e.code)
    return erros, d


def teste_pixel(porta, perfil):
    """Tema pixel art (/?tema=pixel&debug=1, com demonstração): a arte abre, cada estação e cada boneco da planta são desenhados,
    nenhum erro de script, o diagnóstico da planta continua zerado, e a pasta entre salas (primeiro fluxo do layout) é entregue."""
    out = subprocess.run([CHROME] + CHROME_EXTRA + ["--headless=new", "--no-first-run", "--user-data-dir=" + perfil + "px", "--window-size=1600,900",
                          "--virtual-time-budget=12000", "--dump-dom",
                          "http://127.0.0.1:%d/?tema=pixel&debug=1&demo=1&atrasado=1&seed=4&ff=30&testpasta=1" % porta],
                         capture_output=True, text=True, timeout=240, env=dict(os.environ, HOME=pwd.getpwuid(os.getuid()).pw_dir)).stdout
    m = re.search(r'<pre id="dbgpx"[^>]*>(.*?)</pre>', out, re.S)
    if not m:
        return ["Pixel: página sem relatório (não carregou)"]
    v = dict(l.split(" ", 1) for l in m.group(1).splitlines() if " " in l and l.split(" ", 1)[0].isupper())
    erros = []
    if v.get("PIXEL") != "ok": erros.append("Pixel: a arte não abriu (%s)" % v.get("PIXEL"))
    if v.get("ESTACOES") != v.get("ESPERADAS"): erros.append("Pixel: %s estações de %s esperadas" % (v.get("ESTACOES"), v.get("ESPERADAS")))
    b = (v.get("BONECOS") or "0 DE ?").split(" DE ")
    if b[0] != b[-1] or b[0] == "0": erros.append("Pixel: bonecos %s" % v.get("BONECOS"))
    if int(v.get("QUADROS") or 0) < 1: erros.append("Pixel: nenhum quadro desenhado")
    if v.get("RECORTES_OCULTOS") != "0": erros.append("Pixel: %s recortes de placa/painel invisíveis (o texto some)" % v.get("RECORTES_OCULTOS"))
    if v.get("ERROS") != "0": erros.append("Pixel: erros de script: " + m.group(1)[-400:])
    d = re.search(r'<pre id="dbg">(OVERLAPS .*?)</pre>', out, re.S)
    if d:
        ruins = {k: n for k, n in re.findall(r"^([A-Z_]+) (\d+)", d.group(1), re.M) if n != "0"}
        if ruins: erros.append("Pixel: diagnóstico da planta com o pixel art ligado: %s" % ruins)
        pasta = re.search(r"^pasta (.*)$", d.group(1), re.M)
        if not pasta or "entregue em NUNCA" in pasta.group(1) or "NÃO SAIU" in pasta.group(1):
            erros.append("Pasta entre salas: %s" % (pasta.group(1) if pasta else "teste não rodou (layout sem fluxo com as duas estações?)"))
    else:
        erros.append("Pixel: diagnóstico da planta ausente com o pixel art ligado")
    print("Pixel: %s, %s/%s estações, bonecos %s, %s peças, %s quadros, %s erros; %s" % (v.get("PIXEL"), v.get("ESTACOES"), v.get("ESPERADAS"),
          v.get("BONECOS"), v.get("PECAS"), v.get("QUADROS"), v.get("ERROS"), ("pasta " + pasta.group(1)) if d and pasta else "pasta: —"))
    return erros


def teste_3d(porta, perfil):
    """Tema 3D (/?tema=3d&debug=1, com demonstração): WebGL abre (SwiftShader no headless), cada estação e cada boneco da
    planta tem a sua peça 3D, os objetos de parede viram textura, a sombra escurece o piso à frente de um rack (sonda),
    nenhum erro de script e o diagnóstico da planta continua zerado com o 3D ligado. E o endereço antigo /3d redireciona."""
    erros = []
    try:
        final = urllib.request.urlopen("http://127.0.0.1:%d/3d" % porta).geturl()
        if "tema=3d" not in final: erros.append("3D: /3d não levou ao tema 3D (%s)" % final)
    except Exception as e:
        erros.append("3D: /3d falhou: %s" % e)
    m = None
    for tentativa in range(3):     # Three.js carregado em rede (import dinâmico): o headless às vezes salva a página antes; repete
        out = subprocess.run([CHROME] + CHROME_EXTRA + ["--headless=new", "--no-first-run", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                              "--user-data-dir=" + perfil + "3d", "--window-size=1600,900", "--virtual-time-budget=15000", "--dump-dom",
                              "http://127.0.0.1:%d/?tema=3d&debug=1&demo=1&atrasado=1&seed=4&ff=30" % porta], capture_output=True, text=True, timeout=240,
                             env=dict(os.environ, HOME=pwd.getpwuid(os.getuid()).pw_dir)).stdout
        m = re.search(r'<pre id="dbg3d"[^>]*>(.*?)</pre>', out, re.S)
        if m and "SOMBRA ok com" in m.group(1):
            break
    if not m:
        return erros + ["3D: página sem relatório (não carregou)"]
    v = dict(l.split(" ", 1) for l in m.group(1).splitlines() if " " in l and l.split(" ", 1)[0].isupper())
    if v.get("WEBGL") != "ok": erros.append("3D: WebGL não abriu")
    if v.get("ESTACOES") != v.get("ESPERADAS"): erros.append("3D: %s estações de %s esperadas" % (v.get("ESTACOES"), v.get("ESPERADAS")))
    b = (v.get("BONECOS") or "0 DE ?").split(" DE ")
    if b[0] != b[-1] or b[0] == "0": erros.append("3D: bonecos %s" % v.get("BONECOS"))
    if int(v.get("DECALS") or 0) < 3: erros.append("3D: objetos de parede não viraram textura (%s)" % v.get("DECALS"))
    s = re.match(r"ok com (\S+) sem (\S+)", v.get("SOMBRA") or "")   # 5 pontos do piso em volta do 1º rack: algum tem de escurecer
    sombra = bool(s) and any(int(c) < .85 * int(x) for c, x in zip(s.group(1).split("/"), s.group(2).split("/")) if int(x) > 0)
    if not sombra: erros.append("3D: a sombra não aparece no piso (%s)" % v.get("SOMBRA"))
    if v.get("ERROS") != "0": erros.append("3D: erros de script: " + m.group(1)[-400:])
    d = re.search(r'<pre id="dbg">(OVERLAPS .*?)</pre>', out, re.S)
    if d:
        ruins = {k: n for k, n in re.findall(r"^([A-Z_]+) (\d+)", d.group(1), re.M) if n != "0"}
        if ruins: erros.append("3D: diagnóstico da planta com o 3D ligado: %s" % ruins)
    else:
        erros.append("3D: diagnóstico da planta ausente com o 3D ligado")
    print("3D: WebGL %s, %s/%s estações, bonecos %s, %s texturas de parede, sombra %s, %s erros" % (v.get("WEBGL"), v.get("ESTACOES"), v.get("ESPERADAS"),
          v.get("BONECOS"), v.get("DECALS"), "ok" if sombra else "FALHOU", v.get("ERROS")))
    return erros


def cenario_arquivos(tmp, formato, base):
    """Catálogo real (ou de exemplo) + 2 agentes fictícios, jobs com 1 falha, equipe fictícia no formato "novo" (só totais) ou "antigo" (por pessoa)."""
    cat = dict(base["catalogo"])
    cat["zz_sem_sala_teste"] = {"descricao": "agente fictício sem sala (teste; nome fora de qualquer prefixo)", "modelo": "modelo-teste"}
    cat["consulta_teste"] = {"descricao": "agente fictício (teste)", "modelo": "modelo-teste"}   # nome de tamanho comum: nomes > ~18 letras em sala de 1 fileira podem encostar na mesa da sala vizinha (limitação conhecida)
    jobs = json.loads(json.dumps(base["jobs"]))
    lista = jobs["jobs"] if isinstance(jobs, dict) and "jobs" in jobs else jobs
    if lista:
        lista[0]["last_status"] = "error"
    hoje = time.strftime("%Y-%m-%d")
    if formato == "antigo":
        membros = [{"id": 900 + i, "nome": "Pessoa%d Teste" % (i + 1)} for i in range(4)]
        eq = {"updated_at": time.time(), "dia": hoje, "membros": membros,
              "abertos": {str(m["id"]): 10 * (i + 1) for i, m in enumerate(membros)},
              "encerrados_hoje": {str(m["id"]): i for i, m in enumerate(membros)},
              "sem_responsavel": 3, "abertos_total": 100}
    else:
        eq = {"updated_at": time.time(), "dia": hoje, "abertos_total": 100, "sem_responsavel": 3, "encerrados_hoje_total": 6}
    arq = {}
    for nome, obj in (("agentes.json", cat), ("jobs.json", jobs), ("equipe.json", eq)):
        p = os.path.join(tmp, "%s_%s" % (formato, nome)); json.dump(obj, open(p, "w")); arq[nome] = p
    return {"SALA_AGENTES": arq["agentes.json"], "SALA_JOBS": arq["jobs.json"], "SALA_EQUIPE": arq["equipe.json"]}


def main():
    # 1º os testes rápidos da lógica do servidor (sem navegador): status, atraso, privacidade, travas
    r = subprocess.run([sys.executable, os.path.join(AQUI, "testes_servidor.py")], capture_output=True, text=True, timeout=120)
    print("servidor: " + ((r.stderr.strip().splitlines() or ["?"])[-1]))
    if r.returncode != 0:
        print(r.stderr[-3000:])
        raise SystemExit("testes do servidor falharam: a parte visual nem roda")
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
            casos.append(("Modo TV", "debug=1&tema=tv&seed=2&ff=%s" % ff))
            casos.append(("Modo TV · demonstração", "debug=1&tema=tv&demo=1&travado=1&seed=4&ff=%s&jarvis=running" % ff))
            casos.append(("animação desligada · só rodando e falha", "debug=1&anim=desligada&rotulos=problemas&demo=1&seed=3&ff=60"))
            casos.append(("rótulos: nomes + rodando e falha", "debug=1&rotulos=ativos&demo=1&seed=5&ff=%s" % ff))
            casos.append(("demonstração · atrasado + sem ação", "debug=1&demo=1&atrasado=1&travado=1&seed=6&ff=%s" % ff))
            casos.append(("Modo TV · atrasado", "debug=1&tema=tv&demo=1&atrasado=1&seed=7&ff=%s" % ff))
            casos.append(("Pixel art · Modo TV · demonstração", "debug=1&tema=pixeltv&demo=1&atrasado=1&seed=4&ff=%s" % ff))
            casos.append(("nomes técnicos + modo lista", "debug=1&nomes=tecnicos&lista=1&demo=1&seed=8&ff=%s" % ff))
            casos.append(("manutenção + 30 dias", "debug=1&demo=1&manut=1&periodo=30&seed=5&ff=%s" % ff))
            casos.append(("manutenção + 90 dias + lista e CSV", "debug=1&demo=1&manut=1&periodo=90&lista=1&seed=9&ff=%s" % ff))
            for nome, q in casos:
                linhas.append((nome,) + _rodar(porta, q, perfil, falhas, nome))
            nome = "tela de notebook 1440x900 · painel lateral"     # atividade recente espremida pelo detalhe (bug de 16/10/2026)
            linhas.append((nome,) + _rodar(porta, "debug=1&seed=2&ff=60", perfil, falhas, nome, "1440,900"))
            for nome, q, jan in (("JOBS · dados atuais", "debug=1&jobs=1&seed=2&ff=60", "1920,1080"),
                                 ("JOBS · demonstração · 90 dias", "debug=1&jobs=1&demo=1&periodo=90&seed=3&ff=60", "1920,1080"),
                                 ("JOBS · tela de notebook 1440x900 · 30 dias", "debug=1&jobs=1&periodo=30&seed=4&ff=60", "1440,900")):
                linhas.append((nome,) + _rodar(porta, q, perfil, falhas, nome, jan))
            nome = "tela de notebook 1440x900 · demonstração"
            linhas.append((nome,) + _rodar(porta, "debug=1&demo=1&seed=4&ff=60", perfil, falhas, nome, "1440,900"))
            # tela em inglês (16/10/2026): o diagnóstico procura texto em português que sobrou (IDIOMA: ... conta em ERROS)
            for nome, q, jan in (("inglês · dados atuais", "debug=1&lang=en&seed=2&ff=%s" % ff, "1920,1080"),
                                 ("inglês · demonstração · manutenção + atrasado + sem ação", "debug=1&lang=en&demo=1&manut=1&atrasado=1&travado=1&seed=4&ff=%s" % ff, "1920,1080"),
                                 ("inglês · Modo TV · demonstração", "debug=1&lang=en&tema=tv&demo=1&atrasado=1&seed=7&ff=%s" % ff, "1920,1080"),
                                 ("inglês · lista · 30 dias · animação desligada", "debug=1&lang=en&lista=1&demo=1&periodo=30&anim=desligada&seed=5&ff=60", "1920,1080"),
                                 ("inglês · JOBS · notebook 1440x900 · 30 dias", "debug=1&lang=en&jobs=1&demo=1&periodo=30&seed=4&ff=60", "1440,900")):
                linhas.append((nome,) + _rodar(porta, q, perfil, falhas, nome, jan))
            falhas += teste_idioma(porta, perfil)
            falhas += teste_3d(porta, perfil)
            falhas += teste_pixel(porta, perfil)
        finally:
            proc.kill()
        for n in ("novo", "antigo"):
            env = cenario_arquivos(tmp, n, base)
            proc, porta = subir(env)
            try:
                erros, d = api(porta)
                falhas += ["API (cenário equipe %s): %s" % (n, e) for e in erros]
                if "zz_sem_sala_teste" not in d["sem_setor"]:
                    falhas.append("cenário: agente sem sala não foi para NOVOS AGENTES")
                bruto = json.dumps(d, ensure_ascii=False)
                if "Pessoa1" in bruto or '"membros":' in bruto or '"pessoa:' in bruto:   # nomes fictícios do cenário antigo, chave da lista, id antigo
                    falhas.append("cenário equipe %s: nome ou número por pessoa chegou ao navegador" % n)
                est = [x for x in (d.get("equipe_estacao") or []) if not x.get("decor")]
                if any(x.get("abertos") is not None for x in d.get("equipe_estacao") or [] if x.get("decor")):
                    falhas.append("cenário equipe %s: mesa ilustrativa com número" % n)
                if len(est) != 1 or est[0].get("abertos") != 100 or est[0].get("encerrados") != 6 or est[0].get("sem_responsavel") != 3:
                    falhas.append("cenário equipe %s: estação da equipe com totais errados: %s" % (n, est))
                nome = "cenário: agente novo + cron com falha + equipe (%s)" % n
                linhas.append((nome,) + _rodar(porta, "debug=1&seed=5&ff=%s" % ff, perfil, falhas, nome))
            finally:
                proc.kill()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    # tarja de versão nova: com uma versão maior no "GitHub" (variável de teste) a página mostra o aviso; sem ela, não
    for remota, quer in (("99.0.0", True), ("", False)):
        proc, porta = subir({"SALA_VERSAO_REMOTA": remota})
        try:
            erros, d = api(porta)
            falhas += ["API (versão): " + e for e in erros]
            if bool((d.get("atualizacao") or {}).get("nova")) != quer:
                falhas.append("versão: atualizacao.nova deveria ser %s (remota %r): %s" % (quer, remota, d.get("atualizacao")))
            dom = subprocess.run([CHROME] + CHROME_EXTRA + ["--headless=new", "--disable-gpu", "--no-first-run", "--user-data-dir=" + perfil,
                                  "--window-size=1920,1080", "--virtual-time-budget=8000", "--dump-dom", "http://127.0.0.1:%d/?lang=pt" % porta],
                                 capture_output=True, text=True, timeout=240, env=dict(os.environ, HOME=pwd.getpwuid(os.getuid()).pw_dir)).stdout
            m = re.search(r'<div[^>]*id="notice"[^>]*>(.*?)</div>', dom, re.S)
            visivel = bool(m and "versão nova" in m.group(1) and "display: none" not in m.group(0).split(">")[0])
            if visivel != quer:
                falhas.append("versão: tarja %s na página (remota %r)" % ("apareceu" if visivel else "não apareceu", remota))
        finally:
            proc.kill()
    larg = max(len(l[0]) for l in linhas)
    print("%-*s  %s" % (larg, "caso", "  ".join(c[:6] for c in CONTADORES)))
    for l in linhas:
        print("%-*s  %s" % (larg, l[0], "  ".join(("%6s" % ("?" if v is None else v)) for v in l[1])))
    if falhas:
        print("\nPROBLEMAS:"); [print(" -", f) for f in falhas]
        return 1
    print("\nOK: todos os contadores em 0, API coerente e Host de fora bloqueado.")
    return 0


def teste_idioma(porta, perfil):
    """Sem ?lang=, a língua vem do navegador: português fica em português; inglês e qualquer outra língua, inglês."""
    falhas = []
    for lang, esp in (("pt-BR", "pt-BR"), ("pt-PT", "pt-BR"), ("en-US", "en"), ("fr-FR", "en"), ("es-ES", "en")):
        out = subprocess.run([CHROME] + CHROME_EXTRA + ["--headless=new", "--disable-gpu", "--no-first-run", "--lang=" + lang, "--accept-lang=" + lang,   # no Mac, só --accept-lang muda o navigator.language do headless
                              "--user-data-dir=" + perfil + "lang" + lang, "--window-size=1280,800", "--virtual-time-budget=6000",
                              "--dump-dom", "http://127.0.0.1:%d/" % porta], capture_output=True, text=True, timeout=120,
                             env=dict(os.environ, HOME=pwd.getpwuid(os.getuid()).pw_dir)).stdout
        m = re.search(r'<html lang="([^"]+)"', out)
        rot = re.search(r'id="k-err"', out) and re.search(r'<label data-en="Failures today">([^<]*)</label>', out)
        if not m or m.group(1) != esp:
            falhas.append("idioma: navegador em %s abriu a página em %s (esperado %s)" % (lang, m and m.group(1), esp))
        elif rot and rot.group(1) != ("Falhas hoje" if esp == "pt-BR" else "Failures today"):
            falhas.append("idioma: navegador em %s, mas o card mostra %r" % (lang, rot.group(1)))
    return falhas


def _rodar(porta, q, perfil, falhas, nome, janela="1920,1080"):
    vals, det = pagina(porta, q, perfil, janela)
    if vals is None:
        falhas.append("%s: %s" % (nome, det)); return (tuple([None] * len(CONTADORES)),)
    ruins = [c for c in CONTADORES if vals[c] != 0]
    fps = FPS.get(q if "lang=" in q else q + "&lang=pt")
    esperado = r"^(animação desligada|animation off)$" if "anim=desligada" in q else r"^(\d+ fps( · reduzida| · reduced)?|medindo fps…|measuring fps…)$"   # sob tempo virtual o relógio não anda: o número real é medido em fps_real()
    if fps is None or not re.match(esperado, fps):
        falhas.append("%s: fps do card Operação fora do formato: %r" % (nome, fps))
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
