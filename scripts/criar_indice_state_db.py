#!/opt/homebrew/bin/python3
"""Cria índice no state.db do Hermes (somente leitura do servidor).

O servidor abre ~/.hermes/state.db em modo read-only (mode=ro), então não
pode criar índice. Este script roda uma vez, fora do servidor, e cria:

    CREATE INDEX IF NOT EXISTS idx_messages_session_ts
        ON messages(session_id, timestamp)

Isso reduz a leitura de estado(90) de ~10 s para < 1 s em históricos pesados.
O índice persiste; não precisa rodar de novo.

Uso:
    python3 scripts/criar_indice_state_db.py          # cria o índice na produção
    python3 scripts/criar_indice_state_db.py --bench  # bench em cópia temporária (não toca a produção)
"""
import os, sqlite3, sys, tempfile, time, json
from datetime import datetime, timedelta

STATE_DB = os.path.expanduser("~/.hermes/state.db")
INDEX_NAME = "idx_messages_session_ts"
INDEX_SQL = f"CREATE INDEX IF NOT EXISTS {INDEX_NAME} ON messages(session_id, timestamp)"


def criar(db_path=STATE_DB):
    if not os.path.exists(db_path):
        print(f"state.db não encontrado: {db_path}")
        return 1
    con = sqlite3.connect(db_path, timeout=30)
    try:
        con.execute(INDEX_SQL)
        con.commit()
        print(f"Índice '{INDEX_NAME}' criado em {db_path}")
    except Exception as e:
        print(f"Falha ao criar índice: {e}")
        return 1
    finally:
        con.close()
    return 0


def bench():
    """Copia o state.db para um diretório temporário, popula 20.000 mensagens
    simuladas e mede estado(90) antes/depois do índice. Não toca a produção."""
    import shutil
    tmp = tempfile.mkdtemp(prefix="sala_bench_state_")
    src = STATE_DB if os.path.exists(STATE_DB) else None
    db = os.path.join(tmp, "state.db")
    if src and os.path.getsize(src) > 0:
        shutil.copy2(src, db)
    else:
        # cria um state.db vazio com o esquema esperado
        con = sqlite3.connect(db)
        con.execute("create table if not exists sessions (id text, source text, model text, started_at real, ended_at real, estimated_cost_usd real, input_tokens int, output_tokens int)")
        con.execute("create table if not exists messages (id integer primary key, session_id text, role text, content text, tool_calls text, tool_name text, effect_disposition text, timestamp real, token_count int, finish_reason text, reasoning text, reasoning_content text)")
        con.commit(); con.close()
    # popula 20.000 mensagens de 20 sessões (simula histórico pesado)
    agora = time.time()
    con = sqlite3.connect(db)
    con.execute("delete from messages")
    con.execute("delete from sessions")
    for s in range(20):
        sid = f"sess-{s}"
        con.execute("insert into sessions values (?,?,?,?,?,?,?,?)",
                    (sid, "oneshot", "m1", agora - 400, agora - 300, 0.01, 100, 20))
        for m in range(1000):
            ts = agora - 400 + m * 0.3
            con.execute("insert into messages (session_id, role, content, tool_calls, timestamp) values (?,?,?,?,?)",
                        (sid, "assistant" if m % 2 == 0 else "user",
                         f"mensagem {m} da sessão {s}", None, ts))
    con.commit(); con.close()
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import server
    servidor_db_antigo = server.STATE_DB
    server.STATE_DB = db
    try:
        t0 = time.time(); server.estado(90); t_sem = time.time() - t0
        criar(db)
        t0 = time.time(); server.estado(90); t_com = time.time() - t0
    finally:
        server.STATE_DB = servidor_db_antigo
    print(f"estado(90) com 20.000 mensagens: sem índice = {t_sem:.2f}s | com índice = {t_com:.2f}s")
    shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--bench":
        sys.exit(bench())
    sys.exit(criar())
