#!/usr/bin/env python3
"""Contagem das notas do vault Governança de TI para a placa da DIRETORIA na Sala de Operações.

Chamado pelo LaunchAgent ai.hermes.vault-contagem (a cada 10 min). SOMENTE LEITURA nos vaults; grava só
~/.hermes/data/vault_contagem.json (números: total, contagem por tipo, histórico diário e o resultado da última conferência da auditoria).
Nada de título, caminho ou conteúdo de nota vai para esse arquivo.

- total = todo arquivo .md do vault inteiro (pasta do Obsidian), exceto .obsidian/, .trash/, .git/, .claude/ (skills), node_modules/ e .playwright-mcp/;
- por_tipo = valor de `tipo:` do frontmatter (notas sem tipo contam em "(sem tipo)");
- historico = {AAAA-MM-DD: último total do dia} dos últimos 120 dias (para "+N hoje" e "+N na semana");
- auditoria = resultado de `cron_auditoria_vault.py --so-relatorio` (somente leitura, sem e-mail, sem estado), refeito no máximo a cada 30 min.
"""
import os, re, sys, json, time, subprocess
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sala_config

HOME = os.path.expanduser("~")
VAULT = os.path.expanduser(sala_config.obter("vault_path"))   # no Mac do setor: o caminho que o launchd consegue ler (ver README)
DEST = os.path.join(HOME, ".hermes/data/vault_contagem.json")
AUDITORIA = os.path.join(HOME, ".hermes/scripts/cron_auditoria_vault.py")
IGN = {".obsidian", ".trash", ".git", ".claude", "node_modules", ".playwright-mcp", "__pycache__", ".venv"}
REAUDITAR_S = 30 * 60
DIAS_HISTORICO = 120


ERROS = []


def contar():
    total, tipos = 0, {}
    for d, subs, fs in os.walk(VAULT, onerror=lambda e: ERROS.append(f"{type(e).__name__}: {e.filename}: {e.strerror}")):
        subs[:] = [s for s in subs if s not in IGN]
        for f in fs:
            if not f.endswith(".md") or f.startswith("~$"):
                continue
            total += 1
            try:
                t = open(os.path.join(d, f), encoding="utf8", errors="ignore").read(4000)
            except Exception:
                t = ""
            m = re.match(r"^---\n(.*?)\n---", t, re.S)
            mm = re.search(r"^tipo:\s*(.*)$", m.group(1), re.M) if m else None
            tp = (mm.group(1).strip().strip("\"'") if mm else "") or "(sem tipo)"
            tipos[tp] = tipos.get(tp, 0) + 1
    return total, tipos


def conferir_auditoria():
    r = subprocess.run(["/usr/bin/python3", AUDITORIA, "--so-relatorio"], capture_output=True, text=True, timeout=170)
    m = re.search(r"Divergências abertas:\s*(\d+)", r.stdout)
    if not m:
        return None
    cats = {}
    for l in r.stdout.splitlines():
        mc = re.match(r"^(.+) \((\d+)\)$", l.strip())
        if mc and not l.startswith(" "):
            cats[mc.group(1)] = int(mc.group(2))
    return {"divergencias": int(m.group(1)), "categorias": cats, "checado_em": int(time.time())}


def main():
    if not os.path.isdir(VAULT):
        print("vault inacessível; nada gravado"); return 1
    try:
        ant = json.load(open(DEST, encoding="utf8"))
    except Exception:
        ant = {}
    total, tipos = contar()
    # NUNCA gravar uma contagem suspeita: sem permissão de leitura (ex.: LaunchAgent sem acesso a ~/Library/CloudStorage) o os.walk não dá erro,
    # só devolve vazio, e uma contagem 0 apagaria o valor bom e estragaria o histórico (aconteceu na 1ª execução, 13/10/2026).
    try:
        anterior = json.load(open(DEST, encoding="utf8")).get("total") or 0
    except Exception:
        anterior = 0
    if ERROS or total == 0 or (anterior and total < anterior * 0.5):
        print(f"CONTAGEM SUSPEITA (total={total}, anterior={anterior}); nada gravado. Erros de leitura: {ERROS[:3] or 'nenhum'}")
        return 2
    hoje = datetime.now().strftime("%Y-%m-%d")
    hist = ant.get("historico", {})
    hist[hoje] = total
    corte = (datetime.now() - timedelta(days=DIAS_HISTORICO)).strftime("%Y-%m-%d")
    hist = {d: v for d, v in hist.items() if d >= corte}
    aud = ant.get("auditoria")
    if not aud or time.time() - aud.get("checado_em", 0) > REAUDITAR_S:
        try:
            novo = conferir_auditoria()
            if novo:
                aud = novo
        except Exception:
            pass                                   # mantém a leitura anterior; a placa mostra a idade dela
    out = {"updated_at": int(time.time()), "total": total, "por_tipo": tipos, "historico": hist, "auditoria": aud}
    tmp = DEST + ".tmp"
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    with open(tmp, "w", encoding="utf8") as f:
        json.dump(out, f, ensure_ascii=False)
    os.replace(tmp, DEST)                          # gravação atômica
    print(f"ok total={total} auditoria={(aud or {}).get('divergencias')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
