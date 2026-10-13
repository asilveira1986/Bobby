# Livro de Colorir da Família

PWA estático (sem build). Abra `index.html` por um servidor local, ex.: `python3 -m http.server`.

- **Prompts**: 54 itens (4 folhas de personagem + 50 cenas) com o prompt já montado, botão copiar, opção de incluir o negativo.
- **Enviar imagem**: anexe a imagem gerada em cada cena; fica salva no navegador (IndexedDB).
- **Galeria / Pintar**: balde de tinta, pincel, borracha, desfazer, exportar PNG; a pintura é salva automaticamente.

Fonte dos prompts: `livro-de-colorir-prompts.md`. Após editá-lo, rode `python3 tools/build-data.py` para regenerar `data.js`.
