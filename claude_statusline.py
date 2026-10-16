#!/usr/bin/env python3
"""statusLine do Claude Code -> grava so o uso da assinatura (sessao 5 h e semana 7 d) para o painel Sala de Operacoes.

O Claude Code envia um JSON por stdin a cada resposta. Deste JSON so sao gravados rate_limits.five_hour/seven_day
(percentual e hora de reinicio) e a hora da leitura em ~/.hermes/data/claude_uso.json. Nada de conversa, caminho,
modelo ou custo e gravado. O texto impresso e o que o Claude Code mostra na barra de status.
O campo rate_limits so existe para login por assinatura (Pro/Max) e depois da 1a resposta da sessao.
"""
import sys, os, json, time

DEST = os.path.expanduser("~/.hermes/data/claude_uso.json")


def pct(j):
    try:
        v = float(j.get("used_percentage"))
        return max(0.0, min(100.0, v))
    except Exception:
        return None


def main():
    try:
        d = json.load(sys.stdin)
    except Exception:
        d = {}
    rl = d.get("rate_limits") or {}
    out = {}
    for k in ("five_hour", "seven_day"):
        j = rl.get(k) or {}
        p = pct(j)
        if p is None:
            continue
        try:
            r = int(j.get("resets_at"))
        except Exception:
            r = None
        out[k] = {"used_percentage": p, "resets_at": r}
    if out:
        try:
            os.makedirs(os.path.dirname(DEST), exist_ok=True)
            tmp = DEST + ".tmp"
            with open(tmp, "w", encoding="utf8") as f:
                json.dump({"updated_at": int(time.time()), **out}, f)
            os.replace(tmp, DEST)       # gravacao atomica: o painel nunca le um arquivo pela metade
        except Exception:
            pass                        # a barra de status nunca pode quebrar por causa do painel
    nome = ((d.get("model") or {}).get("display_name")) or ""
    partes = ([nome] if nome else []) + [
        f"{lab} {out[k]['used_percentage']:.0f}%" for k, lab in (("five_hour", "5h"), ("seven_day", "7d")) if k in out]
    print(" | ".join(partes) if partes else (nome or "Claude Code"))


if __name__ == "__main__":
    main()
