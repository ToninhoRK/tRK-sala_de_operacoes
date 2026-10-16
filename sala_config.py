"""Configuração local da Sala de Operações (valores que NÃO ficam no código nem no repositório).

Lida de ~/.hermes/data/sala_config.json (ou do arquivo apontado por $SALA_CONFIG). Modelo: config.exemplo.json.
Chaves usadas:
  agidesk_url                URL base da API do Agidesk (https://<conta>.agidesk.com/api/v1/)
  agidesk_keychain_account   conta do item do Keychain que guarda a chave de aplicação do Agidesk
  agidesk_keychain_service   serviço desse item (a chave só é lida em memória)
  equipe_id                  id da equipe no Agidesk cujos chamados a sala GOVERNANÇA mostra
  vault_path                 pasta do vault do Obsidian a contar (placa da DIRETORIA)
  responsavel_padrao         (opcional) responsável de toda estação sem "responsavel" no agentes.json (server.py)
  alerta_email               (opcional) {"para": um endereço só, "de", "conta_himalaya"}: e-mail do vigia_sala.py
"""
import os, sys, json

CAMINHO = os.path.expanduser(os.environ.get("SALA_CONFIG", "~/.hermes/data/sala_config.json"))


def obter(chave):
    try:
        cfg = json.load(open(CAMINHO, encoding="utf8"))
    except FileNotFoundError:
        sys.exit(f"Falta a configuração local {CAMINHO} (copie config.exemplo.json e preencha).")
    if not cfg.get(chave):
        sys.exit(f"Falta a chave '{chave}' em {CAMINHO}.")
    return cfg[chave]
