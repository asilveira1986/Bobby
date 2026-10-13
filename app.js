"use strict";
const B = window.BOOK;
const $ = (s, r = document) => r.querySelector(s);
const el = (t, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(t), props);
  kids.forEach(k => e.append(k));
  return e;
};
const CHARS = ["PAPAI", "MAMÃE", "JOAQUIM", "LUNA", "NALA"];

/* ---------- storage (IndexedDB: imagens e pinturas) ---------- */
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open("livro-colorir", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("kv");
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => {
  const db = await dbp;
  return new Promise((res, rej) => {
    const t = db.transaction("kv", mode), out = fn(t.objectStore("kv"));
    t.oncomplete = () => res(out.result);
    t.onerror = () => rej(t.error);
  });
};
const kvGet = k => tx("readonly", s => s.get(k));
const kvSet = (k, v) => tx("readwrite", s => s.put(v, k));
const kvDel = k => tx("readwrite", s => s.delete(k));
const kvKeys = () => tx("readonly", s => s.getAllKeys());

// confirmação em dois toques (confirm() não funciona em páginas incorporadas)
function arm(btn, fn) {
  const label = btn.textContent;
  let t;
  btn.onclick = () => {
    if (btn.dataset.armed) { clearTimeout(t); delete btn.dataset.armed; btn.textContent = label; fn(); return; }
    btn.dataset.armed = "1"; btn.textContent = "Toque de novo";
    t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = label; }, 3000);
  };
}

const urls = new Map();
const objUrl = (key, blob) => {
  if (urls.has(key)) URL.revokeObjectURL(urls.get(key));
  const u = URL.createObjectURL(blob);
  urls.set(key, u);
  return u;
};

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 1800);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = el("textarea", { value: text });
    document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  toast("Copiado!");
}

/* ---------- prompts ---------- */
const compose = p => p.replace(/\[([^\]]+)\]/g, (m, k) => B.blocks[k] ?? m);
const chars = p => CHARS.filter(c => p.includes(`[${c}]`));
const finalPrompt = p => compose(p) + ($("#useNeg").checked ? `\n\nNegative prompt: ${B.blocks.NEGATIVO}` : "");

let images = new Set();      // ids com imagem enviada
let pickFor = null;          // id (ou "free") aguardando seleção de arquivo

function renderPrompts() {
  const q = $("#search").value.trim().toLowerCase();
  const open = new Set([...document.querySelectorAll("details.ch[open]")].map(d => d.dataset.n));
  const root = $("#chapters"); root.innerHTML = "";
  let total = 0, done = 0;
  for (const ch of B.chapters) {
    const total0 = ch.scenes.length, done0 = ch.scenes.filter(s => images.has(s.id)).length;
    total += total0; done += done0;
    const scenes = ch.scenes.filter(s => !q || (s.title + " " + s.prompt + " " + s.id).toLowerCase().includes(q));
    if (!scenes.length) continue;
    const d = el("details", { className: "ch" });
    d.dataset.n = ch.n;
    d.open = open.has(String(ch.n)) || !!q;
    d.append(el("summary", {}, el("span", { textContent: ch.n ? `${ch.n}. ${ch.title}` : ch.title }),
      el("span", { className: "cnt", textContent: `${done0}/${total0}` })));
    scenes.forEach(s => d.append(sceneEl(s)));
    root.append(d);
  }
  $("#progress").textContent = `${done} de ${total} imagens geradas`;
}

function sceneEl(s) {
  const has = images.has(s.id);
  const ta = el("textarea", { readOnly: true, value: finalPrompt(s.prompt) });
  ta.dataset.raw = s.prompt;
  const acts = el("div", { className: "acts" });
  acts.append(
    el("button", { textContent: "Copiar prompt", onclick: () => copy(finalPrompt(s.prompt)) }),
    el("button", { className: "ghost", textContent: has ? "Trocar imagem" : "Enviar imagem", onclick: () => pick(s.id) })
  );
  if (has) {
    acts.append(el("button", { textContent: "🎨 Pintar", onclick: () => openPainter(s.id) }));
    const rm = el("button", { className: "ghost", textContent: "Remover" });
    arm(rm, () => removeImage(s.id));
    acts.append(rm);
  }
  const head = el("h3", {}, `${s.id.startsWith("f") ? "" : s.id + " "}${s.title}`);
  if (has) head.append(el("span", { className: "badge", textContent: "✓ gerada" }));
  const wrap = el("div", { className: "scene" }, head,
    el("div", { className: "chips" }, ...chars(s.prompt).map(c => el("span", { className: "chip", textContent: c }))),
    ta, acts);
  if (has) kvGet("img:" + s.id).then(b => b && head.before(el("img", { className: "thumb", src: objUrl("t" + s.id, b), alt: "" })));
  return wrap;
}

function pick(id) { pickFor = id; $("#file").value = ""; $("#file").click(); }

$("#file").onchange = async e => {
  const f = e.target.files[0];
  if (!f || !pickFor) return;
  const id = pickFor === "free" ? "free:" + Date.now() : pickFor;
  await kvSet("img:" + id, f);
  if (pickFor !== "free") await kvDel("color:" + id);
  await refresh();
  toast("Imagem salva");
  if (pickFor === "free") openPainter(id);
};

async function removeImage(id) {
  await kvDel("img:" + id); await kvDel("color:" + id);
  await refresh();
}

/* ---------- galeria ---------- */
function titleOf(id) {
  for (const ch of B.chapters) for (const s of ch.scenes) if (s.id === id) return s.title;
  return "Desenho livre";
}
async function renderGallery() {
  const grid = $("#grid"); grid.innerHTML = "";
  const keys = (await kvKeys()).filter(k => k.startsWith("img:")).map(k => k.slice(4));
  if (!keys.length) { grid.append(el("p", { className: "hint", textContent: "Nenhuma página ainda. Gere as imagens com os prompts e envie aqui." })); return; }
  for (const id of keys) {
    const [c, b] = await Promise.all([kvGet("color:" + id), kvGet("img:" + id)]);
    const img = el("img", { src: objUrl("g" + id, c || b), alt: titleOf(id) });
    grid.append(el("div", { className: "gcard", onclick: () => openPainter(id) }, img,
      el("small", { textContent: id.startsWith("free:") ? "Desenho livre" : `${id.startsWith("f") ? "" : id + " · "}${titleOf(id)}` })));
  }
}

/* ---------- navegação ---------- */
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tabs button,.tab").forEach(x => x.classList.remove("on"));
  b.classList.add("on"); $("#" + b.dataset.tab).classList.add("on");
  if (b.dataset.tab === "gallery") renderGallery();
});
$("#search").oninput = renderPrompts;
try { $("#useNeg").checked = localStorage.getItem("useNeg") === "1"; } catch {}
$("#useNeg").onchange = () => { try { localStorage.setItem("useNeg", $("#useNeg").checked ? "1" : "0"); } catch {} renderPrompts(); };
$("#copyBlocks").onclick = () => copy(Object.entries(B.blocks).map(([k, v]) => `${k}\n${v}`).join("\n\n"));
$("#importFree").onclick = () => pick("free");

async function refresh() {
  images = new Set((await kvKeys()).filter(k => k.startsWith("img:")).map(k => k.slice(4)));
  renderPrompts();
  if ($("#gallery").classList.contains("on")) renderGallery();
}

/* ---------- pintura ---------- */
const PALETTE = ["#e63946", "#ff7a59", "#ffb703", "#ffd166", "#a7d95b", "#2a9d4b", "#2ec4b6", "#8ecae6", "#3a86ff", "#5e3bb5",
  "#c77dff", "#ff8fb1", "#8b5a2b", "#d9a066", "#ffe5c4", "#9aa0a6", "#4a4a4a", "#ffffff"];
const MAXSIDE = 1600;
const P = { id: null, color: PALETTE[0], mode: "bucket", undo: [], barrier: null, w: 0, h: 0, drawing: false, last: null };
const cc = $("#cColor"), cl = $("#cLine");
const cx = cc.getContext("2d", { willReadFrequently: true });

(function buildPalette() {
  const pal = $("#palette");
  PALETTE.forEach((c, i) => {
    const b = el("button", { className: "sw" + (i ? "" : " on") });
    b.style.background = c;
    b.onclick = () => setColor(c, b);
    pal.append(b);
  });
  const custom = el("input", { type: "color", className: "sw", value: "#ff0000", title: "Outra cor" });
  custom.oninput = () => setColor(custom.value, custom);
  pal.append(custom);
})();
function setColor(c, btn) {
  P.color = c;
  document.querySelectorAll(".sw").forEach(x => x.classList.remove("on"));
  btn.classList.add("on");
  if (P.mode === "eraser") setMode("bucket");
}
function setMode(m) {
  P.mode = m;
  document.querySelectorAll(".modes [data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
}
document.querySelectorAll(".modes [data-mode]").forEach(b => b.onclick = () => setMode(b.dataset.mode));

async function openPainter(id) {
  const blob = await kvGet("img:" + id);
  if (!blob) return;
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, MAXSIDE / Math.max(bmp.width, bmp.height));
  const w = P.w = Math.round(bmp.width * k), h = P.h = Math.round(bmp.height * k);
  P.id = id; P.undo = [];
  cc.width = cl.width = w; cc.height = cl.height = h;

  // camada de linhas: preto com alpha proporcional ao escuro; barreira = pixels escuros
  const tmp = el("canvas", { width: w, height: h }), tctx = tmp.getContext("2d");
  tctx.fillStyle = "#fff"; tctx.fillRect(0, 0, w, h); tctx.drawImage(bmp, 0, 0, w, h);
  const src = tctx.getImageData(0, 0, w, h), d = src.data, bar = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    bar[p] = lum < 200 ? 1 : 0;
    d[i] = d[i + 1] = d[i + 2] = 0;
    d[i + 3] = Math.max(0, Math.min(255, (255 - lum) * 1.5));
  }
  cl.getContext("2d").putImageData(src, 0, 0);
  P.barrier = bar;

  cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h);
  const saved = await kvGet("color:" + id);
  if (saved) cx.drawImage(await createImageBitmap(saved), 0, 0);

  $("#pTitle").textContent = id.startsWith("free:") ? "Desenho livre" : titleOf(id);
  $("#painter").hidden = false;
}

const pt = e => {
  const r = cc.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) * P.w / r.width), Math.floor((e.clientY - r.top) * P.h / r.height)];
};
const snapshot = () => { P.undo.push(cx.getImageData(0, 0, P.w, P.h)); if (P.undo.length > 20) P.undo.shift(); };

function fill(x, y) {
  const { w, h, barrier } = P;
  if (x < 0 || y < 0 || x >= w || y >= h || barrier[y * w + x]) return;
  snapshot();
  const img = cx.getImageData(0, 0, w, h), d = img.data;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(P.color.slice(i, i + 2), 16));
  const seen = new Uint8Array(w * h), stack = [x, y];
  while (stack.length) {
    let cy = stack.pop(), cx0 = stack.pop();
    let xl = cx0;
    while (xl >= 0 && !barrier[cy * w + xl] && !seen[cy * w + xl]) xl--;
    xl++;
    let up = false, dn = false;
    for (let xi = xl; xi < w && !barrier[cy * w + xi] && !seen[cy * w + xi]; xi++) {
      seen[cy * w + xi] = 1;
      if (cy > 0) { const o = barrier[(cy - 1) * w + xi] || seen[(cy - 1) * w + xi]; if (!o && !up) { stack.push(xi, cy - 1); up = true; } else if (o) up = false; }
      if (cy < h - 1) { const o = barrier[(cy + 1) * w + xi] || seen[(cy + 1) * w + xi]; if (!o && !dn) { stack.push(xi, cy + 1); dn = true; } else if (o) dn = false; }
    }
  }
  // pinta a região e 2px de borda sob as linhas para não sobrar halo branco
  for (let pass = 0; pass < 2; pass++) {
    const add = [];
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const p = yy * w + xx;
      if (seen[p] || !barrier[p]) continue;
      if ((xx && seen[p - 1] === 1) || (xx < w - 1 && seen[p + 1] === 1) || (yy && seen[p - w] === 1) || (yy < h - 1 && seen[p + w] === 1)) add.push(p);
    }
    add.forEach(p => (seen[p] = 1));
  }
  for (let p = 0; p < seen.length; p++) if (seen[p]) { const i = p * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
  cx.putImageData(img, 0, 0);
  persist();
}

function stroke(a, b) {
  cx.strokeStyle = P.mode === "eraser" ? "#fff" : P.color;
  cx.lineWidth = +$("#size").value * (P.w / 900);
  cx.lineCap = cx.lineJoin = "round";
  cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke();
}

const wrap = $("#wrap");
wrap.onpointerdown = e => {
  const p = pt(e);
  if (P.mode === "bucket") return fill(p[0], p[1]);
  snapshot(); P.drawing = true; P.last = p; wrap.setPointerCapture(e.pointerId); stroke(p, p);
};
wrap.onpointermove = e => { if (P.drawing) { const p = pt(e); stroke(P.last, p); P.last = p; } };
wrap.onpointerup = wrap.onpointercancel = () => { if (P.drawing) { P.drawing = false; persist(); } };

let saveT;
function persist() {
  clearTimeout(saveT);
  const id = P.id;
  saveT = setTimeout(() => cc.toBlob(b => b && kvSet("color:" + id, b)), 400);
}

$("#pUndo").onclick = () => { const s = P.undo.pop(); if (s) { cx.putImageData(s, 0, 0); persist(); } };
arm($("#pClear"), () => { snapshot(); cx.fillStyle = "#fff"; cx.fillRect(0, 0, P.w, P.h); persist(); });
$("#pSave").onclick = () => {
  const out = el("canvas", { width: P.w, height: P.h }), o = out.getContext("2d");
  o.drawImage(cc, 0, 0); o.drawImage(cl, 0, 0);
  out.toBlob(b => {
    const u = URL.createObjectURL(b);
    const ov = el("div", { className: "saveov", onclick: () => { ov.remove(); URL.revokeObjectURL(u); } },
      el("p", { textContent: "Segure a imagem (ou clique com o botão direito) para salvar. Toque fora para fechar." }),
      el("img", { src: u, alt: "Pintura pronta" }));
    document.body.append(ov);
  });
};
$("#pBack").onclick = async () => {
  clearTimeout(saveT);
  await new Promise(r => cc.toBlob(async b => { if (b) await kvSet("color:" + P.id, b); r(); }));
  $("#painter").hidden = true;
  refresh();
};

refresh();
if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !window.claude) navigator.serviceWorker.register("sw.js").catch(() => {});
