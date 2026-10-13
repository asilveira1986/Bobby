#!/usr/bin/env python3
"""Gera data.js a partir de livro-de-colorir-prompts.md (fonte única dos prompts)."""
import json, re, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
lines = (root / "livro-de-colorir-prompts.md").read_text(encoding="utf-8").splitlines()

blocks, sheets, chapters = {}, [], []
h2 = h3 = None
i = 0
while i < len(lines):
    ln = lines[i]
    if ln.startswith("## "):
        h2 = ln[3:].strip()
        m = re.match(r"(\d+)\.\s+(.*)", h2)
        if m:
            chapters.append({"n": int(m[1]), "title": m[2], "scenes": []})
        h3 = None
    elif ln.startswith("### "):
        h3 = ln[4:].strip()
    elif ln.startswith("```") and h3:
        j = i + 1
        body = []
        while not lines[j].startswith("```"):
            body.append(lines[j]); j += 1
        text = " ".join(body).strip()
        i = j
        if h2 == "Como usar":
            blocks[h3.split(" (")[0]] = text
        elif h2 == "Folhas de personagem":
            sheets.append({"id": "f%d" % (len(sheets) + 1), "title": h3, "prompt": text})
        elif chapters and re.match(r"\d+\.\d+ ", h3):
            sid, title = h3.split(" ", 1)
            chapters[-1]["scenes"].append({"id": sid, "title": title, "prompt": text})
    i += 1

assert len(blocks) == 7 and len(sheets) == 4 and sum(len(c["scenes"]) for c in chapters) == 50, \
    (len(blocks), len(sheets), [len(c["scenes"]) for c in chapters])
data = {"blocks": blocks, "chapters": [{"n": 0, "title": "Folhas de personagem", "scenes": sheets}] + chapters}
(root / "data.js").write_text("window.BOOK = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
print("ok:", len(blocks), "blocos,", len(sheets), "folhas,", sum(len(c["scenes"]) for c in chapters), "cenas")
