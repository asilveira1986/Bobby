# Livro de Colorir da Família

PWA estático, sem dependências e sem build.

## Rodar

```bash
npm start          # ou: python3 -m http.server 8080
```

Abra http://localhost:8080. No celular/tablet na mesma rede Wi-Fi, use `http://<IP-do-computador>:8080`
(para instalar na tela inicial e usar offline, o navegador exige `localhost` ou HTTPS).


- **Prompts**: 54 itens (4 folhas de personagem + 50 cenas) com o prompt já montado, botão copiar, opção de incluir o negativo.
- **Enviar imagem**: anexe a imagem gerada em cada cena; fica salva no navegador (IndexedDB).
- **Galeria / Pintar**: balde de tinta, pincel, borracha, desfazer, exportar PNG; a pintura é salva automaticamente.

Fonte dos prompts: `livro-de-colorir-prompts.md`. Após editá-lo, rode `python3 tools/build-data.py` para regenerar `data.js`.
