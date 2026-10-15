"""Confere que o README em português e a versão em inglês continuam iguais na estrutura.

Compara, na ordem: níveis dos títulos, capturas (caminho das imagens), blocos de código, linhas de tabela e links
para arquivos do repositório. Confere também que cada link do sumário (#âncora) leva a um título que existe e que
cada versão aponta para a outra. Uso: python3 .github/checar_readmes.py (sai com código 1 se algo divergir).
Checks that README.md (Portuguese) and README.en.md (English) keep the same structure; exits 1 on any drift.
"""
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSOES = {"README.md": "README.en.md", "README.en.md": "README.md"}


def ancora(titulo):
    """Mesma regra do GitHub: minúsculas, sem pontuação (letras acentuadas ficam), espaço vira hífen."""
    return re.sub(r"[^\w\- ]", "", titulo.strip().lower()).replace(" ", "-")


def ler(nome):
    texto = open(os.path.join(RAIZ, nome), encoding="utf-8").read()
    sem_codigo = re.sub(r"```.*?```", "", texto, flags=re.S)
    titulos = re.findall(r"^(#{1,6}) (.+)$", sem_codigo, re.M)
    links = re.findall(r"\]\(([^)\s]+)\)", sem_codigo)
    return {
        "titulos": [len(h) for h, _ in titulos],
        "ancoras": {ancora(t) for _, t in titulos},
        "imagens": re.findall(r"!\[[^\]]*\]\(([^)\s]+)\)", sem_codigo),
        "codigo": texto.count("```") // 2,
        "tabela": len(re.findall(r"^\|", sem_codigo, re.M)),
        "arquivos": sorted({l for l in links if not l.startswith(("http", "#")) and not l.startswith("README")}),
        "sumario": [l[1:] for l in links if l.startswith("#")],
        "outra": [l for l in links if l.startswith("README")],
    }


def main():
    v = {n: ler(n) for n in VERSOES}
    erros = []
    a, b = v["README.md"], v["README.en.md"]
    for chave, nome in (("titulos", "títulos (nível e quantidade)"), ("imagens", "capturas"), ("codigo", "blocos de código"),
                        ("tabela", "linhas de tabela"), ("arquivos", "links para arquivos do repositório")):
        if a[chave] != b[chave]:
            erros.append("%s diferentes: README.md %s × README.en.md %s" % (nome, a[chave], b[chave]))
    for nome, d in v.items():
        for anc in d["sumario"]:
            if anc not in d["ancoras"]:
                erros.append("%s: link do sumário #%s não leva a nenhum título" % (nome, anc))
        if VERSOES[nome] not in d["outra"]:
            erros.append("%s: falta o link para %s no topo" % (nome, VERSOES[nome]))
        for arq in d["arquivos"]:
            if not os.path.exists(os.path.join(RAIZ, arq)):
                erros.append("%s: link para arquivo que não existe: %s" % (nome, arq))
    if erros:
        print("READMEs divergentes:\n- " + "\n- ".join(erros))
        return 1
    print("OK: README.md e README.en.md com a mesma estrutura (%d títulos, %d capturas, %d links do sumário)."
          % (len(a["titulos"]), len(a["imagens"]), len(a["sumario"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
