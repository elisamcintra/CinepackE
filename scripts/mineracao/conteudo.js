// Similaridade de CONTEÚDO entre filmes ("o que o filme é", não "quem gostou").
// Três fontes, cada uma vira uma lista de vizinhos por filme (cosseno), guardada em cache:
//   tmdb    palavras-chave, direção, 5 primeiros do elenco e coleção (franquia), via TF-IDF
//   tags    etiquetas livres que as pessoas do MovieLens deram (tags.csv da base 32M), via TF-IDF
//   genome  Tag Genome do MovieLens 25M: relevância de ~1.100 tags por filme (vetor denso, centrado)

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lerJson, lerLinhas, salvarJson, separarCsv } from './util.js';

const K = 50;

// Cosseno esparso com índice invertido. vetores[i] = Map(caracteristica -> peso), já normalizados.
function cossenoEsparso(vetores, { maxDf = 800 } = {}) {
  const n = vetores.length;
  const indice = new Map();
  vetores.forEach((v, i) => {
    for (const [f, w] of v) {
      if (!indice.has(f)) indice.set(f, []);
      indice.get(f).push([i, w]);
    }
  });
  const acc = new Float64Array(n);
  const vizinhos = new Array(n);
  for (let i = 0; i < n; i++) {
    const tocados = [];
    for (const [f, wi] of vetores[i]) {
      const lista = indice.get(f);
      if (lista.length > maxDf) continue; // característica comum demais: quase não diferencia e custa caro
      for (const [j, wj] of lista) {
        if (j === i) continue;
        if (!acc[j]) tocados.push(j);
        acc[j] += wi * wj;
      }
    }
    vizinhos[i] = tocados
      .map((j) => [j, Math.round(acc[j] * 10000) / 10000])
      .sort((a, b) => b[1] - a[1])
      .slice(0, K);
    for (const j of tocados) acc[j] = 0;
  }
  return vizinhos;
}

// TF-IDF + normalização L2
function tfidf(contagens) {
  const n = contagens.length;
  const df = new Map();
  for (const c of contagens) for (const f of c.keys()) df.set(f, (df.get(f) || 0) + 1);
  return contagens.map((c) => {
    const v = new Map();
    let norma = 0;
    for (const [f, tf] of c) {
      const d = df.get(f);
      if (d < 2) continue; // característica que só um filme tem: não liga ninguém
      const w = tf * Math.log(n / d);
      v.set(f, w);
      norma += w * w;
    }
    norma = Math.sqrt(norma) || 1;
    for (const [f, w] of v) v.set(f, w / norma);
    return v;
  });
}

function conteudoTmdb(cfg, itens) {
  const arquivo = path.join(cfg.dirDados, 'processado', 'tmdb-metadados.json');
  if (!existsSync(arquivo)) throw new Error('Faltam os metadados do TMDB. Rode: npm run mineracao:conteudo');
  const meta = JSON.parse(readFileSync(arquivo, 'utf8'));
  const contagens = itens.map((f) => {
    const m = meta[f.tmdb];
    const c = new Map();
    if (!m) return c;
    for (const [id] of m.kw) c.set(`k${id}`, 1);
    for (const d of m.dir) c.set(`d${d}`, 1.5);
    m.cast.forEach((a, pos) => c.set(`a${a}`, 1 - pos * 0.1));
    if (m.col) c.set(`c${m.col}`, 1.5);
    return c;
  });
  return cossenoEsparso(tfidf(contagens));
}

async function conteudoTags(cfg, itens) {
  const pos = new Map(itens.map((f, i) => [f.movieId, i]));
  const contagens = itens.map(() => new Map());
  await lerLinhas(
    path.join(cfg.dirBruto, 'tags.csv'),
    (linha) => {
      const [, movieId, tag] = separarCsv(linha);
      const i = pos.get(Number(movieId));
      if (i === undefined || !tag) return;
      const t = tag.trim().toLowerCase();
      if (t.length < 2) return;
      contagens[i].set(t, (contagens[i].get(t) || 0) + 1);
    },
    { rotulo: 'Lendo tags' }
  );
  // tf = log(1 + quantas pessoas usaram a tag); só as 150 mais fortes por filme
  for (let i = 0; i < contagens.length; i++) {
    const top = [...contagens[i].entries()].sort((a, b) => b[1] - a[1]).slice(0, 150);
    contagens[i] = new Map(top.map(([t, q]) => [t, Math.log(1 + q)]));
  }
  return cossenoEsparso(tfidf(contagens));
}

async function conteudoGenome(cfg, itens) {
  const dir = path.join(cfg.dirDados, 'bruto', 'ml-25m');
  if (!existsSync(path.join(dir, 'genome-scores.csv'))) throw new Error('Falta o Tag Genome. Rode: npm run mineracao:conteudo');
  // O ID do filme é o mesmo nas bases do MovieLens; conferimos pelo TMDB para não misturar
  const tmdbDo25m = new Map();
  await lerLinhas(path.join(dir, 'links.csv'), (l) => {
    const [m, , t] = l.split(',');
    if (t) tmdbDo25m.set(Number(m), Number(t));
  });
  const pos = new Map();
  itens.forEach((f, i) => {
    if (tmdbDo25m.get(f.movieId) === f.tmdb) pos.set(f.movieId, i);
  });
  const T = 1128;
  const n = itens.length;
  const M = new Float32Array(n * T);
  const tem = new Uint8Array(n);
  await lerLinhas(
    path.join(dir, 'genome-scores.csv'),
    (l) => {
      const a = l.indexOf(',');
      const b = l.indexOf(',', a + 1);
      const i = pos.get(Number(l.slice(0, a)));
      if (i === undefined) return;
      const tag = Number(l.slice(a + 1, b)) - 1;
      if (tag >= 0 && tag < T) {
        M[i * T + tag] = Number(l.slice(b + 1));
        tem[i] = 1;
      }
    },
    { rotulo: 'Lendo genome' }
  );
  // Centra cada tag (subtrai a média) e normaliza cada filme
  const media = new Float64Array(T);
  let q = 0;
  for (let i = 0; i < n; i++) if (tem[i]) { q++; for (let t = 0; t < T; t++) media[t] += M[i * T + t]; }
  for (let t = 0; t < T; t++) media[t] /= q || 1;
  for (let i = 0; i < n; i++) {
    if (!tem[i]) continue;
    let s = 0;
    for (let t = 0; t < T; t++) { const v = M[i * T + t] - media[t]; M[i * T + t] = v; s += v * v; }
    const norma = Math.sqrt(s) || 1;
    for (let t = 0; t < T; t++) M[i * T + t] /= norma;
  }
  const com = [...Array(n).keys()].filter((i) => tem[i]);
  const vizinhos = itens.map(() => []);
  const sims = new Float64Array(n);
  for (const i of com) {
    const oi = i * T;
    for (const j of com) {
      if (j === i) { sims[j] = -Infinity; continue; }
      let s = 0;
      const oj = j * T;
      for (let t = 0; t < T; t++) s += M[oi + t] * M[oj + t];
      sims[j] = s;
    }
    vizinhos[i] = com
      .filter((j) => j !== i)
      .sort((a, b) => sims[b] - sims[a])
      .slice(0, K)
      .map((j) => [j, Math.round(sims[j] * 10000) / 10000]);
  }
  console.log(`   Genome: ${com.length} de ${n} filmes têm tags`);
  return vizinhos;
}

const FONTES = { tmdb: conteudoTmdb, tags: conteudoTags, genome: conteudoGenome };

/** Carrega (ou calcula e guarda em cache) os vizinhos de conteúdo de cada fonte pedida. */
export async function carregarConteudo(cfg, fontes) {
  const itens = lerJson(cfg.dirProcessado, 'etapa2-itens.json');
  const out = {};
  for (const f of fontes) {
    const nome = `conteudo-${f}.json`;
    if (existsSync(path.join(cfg.dirProcessado, nome))) {
      out[f] = lerJson(cfg.dirProcessado, nome);
      continue;
    }
    const inicio = Date.now();
    out[f] = await FONTES[f](cfg, itens);
    salvarJson(cfg.dirProcessado, nome, out[f]);
    console.log(`   Conteúdo "${f}" calculado em ${((Date.now() - inicio) / 1000).toFixed(0)}s`);
  }
  return out;
}
