#!/usr/bin/env python3
"""Atualiza o uso do Claude (sessao 5 h e semana 7 d) para o painel Sala de Operacoes, sem depender de sessao aberta.

Uma consulta SOMENTE LEITURA ao endpoint nao documentado GET https://api.anthropic.com/api/oauth/usage (o mesmo que
ferramentas da comunidade usam), com o token OAuth que o proprio Claude Code guarda (~/.claude/.credentials.json ou Keychain "Claude Code-credentials"). Nao e chamada de modelo: nao gasta mensagem nem tokens da cota.
Chamado pelo LaunchAgent ai.hermes.claude-uso-poll a cada 5 min.

Regras de seguranca:
- o token so e lido na memoria; nunca e impresso, gravado nem logado (o log tem so hora, codigo HTTP e percentuais);
- NAO renova o token (renovar por fora poderia invalidar o refresh token do Claude Code): token vencido = pula;
- grava o MESMO arquivo e formato do claude_statusline.py (~/.hermes/data/claude_uso.json), so com percentual e resets_at;
- em erro (401/403/429/rede) nao toca no arquivo (o painel continua mostrando o ultimo valor, com "lido ha X");
  429 e 401/403 ligam um recuo de 30 min / 60 min (estado em ~/.hermes/data/claude_uso_poll.estado.json).
Argumento --simular: nao consulta a rede nem grava; mostra o que faria.
"""
import sys, os, json, time, getpass, subprocess, urllib.request, urllib.error
from datetime import datetime

DADOS = os.path.expanduser("~/.hermes/data")
DEST = os.path.join(DADOS, "claude_uso.json")
ESTADO = os.path.join(DADOS, "claude_uso_poll.estado.json")
LOG = os.path.join(DADOS, "claude_uso_poll.log")
URL = "https://api.anthropic.com/api/oauth/usage"


def log(msg):
    try:
        with open(LOG, "a", encoding="utf8") as f:
            f.write(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}\n")
        if os.path.getsize(LOG) > 200_000:          # mantem o log pequeno: guarda so a metade final
            t = open(LOG, encoding="utf8").read().splitlines()[-500:]
            open(LOG, "w", encoding="utf8").write("\n".join(t) + "\n")
    except Exception:
        pass


def estado():
    try:
        return json.load(open(ESTADO, encoding="utf8"))
    except Exception:
        return {}


def recuo(seg, motivo):
    try:
        json.dump({"ate": int(time.time()) + seg, "motivo": motivo}, open(ESTADO, "w", encoding="utf8"))
    except Exception:
        pass


def _oauth(c):
    """Bloco claudeAiOauth de um JSON de credencial (ou None)."""
    if isinstance(c, dict):
        o = c.get("claudeAiOauth")
        if isinstance(o, dict) and o.get("accessToken"):
            return o
    return None


def _keychain():
    """Credencial do Keychain. O `security -w` devolve HEX quando o valor tem byte de controle: tenta JSON direto e, se falhar, o hex decodificado."""
    r = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", "Claude Code-credentials",
                        "-a", getpass.getuser(), "-w"], capture_output=True, text=True, timeout=20)
    if r.returncode:
        return None
    s = r.stdout.strip()
    for tentativa in (lambda: json.loads(s), lambda: json.loads(bytes.fromhex(s).decode("utf8"))):
        try:
            return tentativa()
        except Exception:
            pass
    return None


def _arquivo():
    """~/.claude/.credentials.json: onde as versões atuais do Claude Code guardam o token."""
    try:
        return json.load(open(os.path.expanduser("~/.claude/.credentials.json"), encoding="utf8"))
    except Exception:
        return None


def token():
    """Procura o token OAuth do Claude Code no arquivo de credenciais e no Keychain e usa o que vence mais tarde.
    Desde 13/10/2026 o Keychain pode trazer só entradas de MCP (sem claudeAiOauth) e o token fica no arquivo."""
    achados = [(o, nome) for nome, c in (("arquivo", _arquivo()), ("keychain", _keychain())) if (o := _oauth(c))]
    if not achados:
        return None, "sem token do Claude Code (nem em ~/.claude/.credentials.json nem no Keychain; faça /login)"
    def exp(o):
        try:
            return float(o.get("expiresAt", 0)) / 1000
        except Exception:
            return 0
    o, _ = max(achados, key=lambda x: exp(x[0]))
    if exp(o) and exp(o) < time.time() + 60:
        return None, "token vencido (o Claude Code renova numa sessão nova; o script não renova)"
    return o["accessToken"], None


def epoch(iso):
    try:
        return int(datetime.fromisoformat(iso).timestamp())
    except Exception:
        return None


def main():
    simular = "--simular" in sys.argv
    e = estado()
    if e.get("ate", 0) > time.time() and not simular:
        return 0                                    # em recuo: nao consulta
    tk, erro = token()
    if erro:
        log("pulou: " + erro)
        return 0
    if simular:
        print("simulacao: leria o token do Keychain e consultaria", URL, "-> nada consultado, nada gravado")
        return 0
    req = urllib.request.Request(URL, headers={"Authorization": "Bearer " + tk, "anthropic-beta": "oauth-2025-04-20",
                                               "User-Agent": "claude-code/2.1.278"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.loads(r.read())
    except urllib.error.HTTPError as x:
        if x.code == 429:
            recuo(1800, "429"); log("HTTP 429: recuo de 30 min")
        elif x.code in (401, 403):
            recuo(3600, str(x.code)); log(f"HTTP {x.code}: recuo de 60 min")
        else:
            log(f"HTTP {x.code}")
        return 0
    except Exception as x:
        log("erro de rede: " + type(x).__name__)
        return 0
    out = {}
    for k in ("five_hour", "seven_day"):
        j = d.get(k) or {}
        try:
            p = max(0.0, min(100.0, float(j.get("utilization"))))
        except Exception:
            continue
        out[k] = {"used_percentage": p, "resets_at": epoch(j.get("resets_at"))}
    if not out:
        log("resposta sem five_hour/seven_day (formato mudou?)")
        return 0
    tmp = DEST + ".tmp"
    with open(tmp, "w", encoding="utf8") as f:
        json.dump({"updated_at": int(time.time()), **out}, f)
    os.replace(tmp, DEST)
    log("ok " + " ".join(f"{k}={v['used_percentage']:.0f}%" for k, v in out.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
