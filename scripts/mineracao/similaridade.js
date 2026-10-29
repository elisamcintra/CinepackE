// Similaridade item-item a partir da coocorrência (etapa 4) e, opcionalmente, do conteúdo.
//
// Modelos de comportamento:
//   item-item (padrão)  sim(A→B) = cw(A,B) / (nA^(1-α) · nB^α) × c/(c + encolhimento)
//        A = filme da pessoa, B = candidato. α = 0,5 é o cosseno normal (modelo original).
//        α > 0,5 divide mais por nB, ou seja, dá menos peso a candidato B popular
//        (correção do VIÉS DE POPULARIDADE: cosseno assimétrico, Aiolli 2013).
//   ease                regressão linear fechada (Steck 2019): B = I − P·diag(1/diag(P)), P = (XᵀX + λI)⁻¹.
//        Aprende pesos que "descontam" o que outros filmes já explicam (menos efeito de popularidade).
//   Nos dois, com recência ligada (meiaVidaPessoaDias > 0), as contagens são ponderadas: cw e nW.
//
// Conteúdo (opcional, para os dois modelos): sim_final = (1-γ)·sim + γ·κ·cos_conteudo, com κ ajustando
// as escalas (κ = média do top-10 do comportamento ÷ média do top-10 do conteúdo).
//
// Saída: vizinhos[i] = [[j, sim, confiança, lift], ...] (os K maiores, em ordem).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const posicaoPar = (i, j, n) => (i < j ? (i * (2 * n - i - 1)) / 2 + (j - i - 1) : (j * (2 * n - j - 1)) / 2 + (i - j - 1));
const MANTER = 200; // quantos vizinhos de comportamento guardamos antes de misturar com o conteúdo

/**
 * dados = { n, U, curtidas (Int32Array), co (Uint32Array, triangular), curtidasW?, coW? }
 * p = parâmetros (config.js); conteudo = { fonte: vizinhosDeConteudo[] } (ver conteudo.js)
 * opcoes.dirCache: onde guardar o EASE já calculado (a inversão leva minutos)
 */
export function construirVizinhos(dados, p, conteudo = {}, { dirCache } = {}) {
  const K = p.vizinhosPorFilme;
  const { cf, regras } = p.modelo === 'ease' ? construirEase(dados, p, dirCache) : construirItemItem(dados, p);

  const fontes = (p.conteudo || []).filter((f) => conteudo[f]);
  const gama = fontes.length ? p.gamaConteudo || 0 : 0;
  if (!gama) return { vizinhos: cf.map((l) => l.slice(0, K)), regras, kappa: null };

  const { n, U, curtidas, co } = dados;
  const media10 = (listas) => {
    let s = 0;
    let q = 0;
    for (const l of listas) for (const x of l.slice(0, 10)) {
      s += x[1];
      q++;
    }
    return q ? s / q : 1;
  };
  const kappaPorFonte = Object.fromEntries(fontes.map((f) => [f, media10(cf) / media10(conteudo[f])]));
  const vizinhos = new Array(n);
  for (let i = 0; i < n; i++) {
    const comb = new Map();
    for (const [j, s, conf, lift] of cf[i]) comb.set(j, { cf: s, cont: 0, conf, lift });
    for (const f of fontes) {
      for (const [j, cos] of conteudo[f][i] || []) {
        if (j === i) continue;
        let e = comb.get(j);
        if (!e) {
          const c = co[posicaoPar(i, j, n)];
          e = { cf: 0, cont: 0, conf: curtidas[i] ? c / curtidas[i] : 0, lift: curtidas[i] && curtidas[j] ? (c * U) / (curtidas[i] * curtidas[j]) : 0 };
          comb.set(j, e);
        }
        e.cont += (kappaPorFonte[f] * cos) / fontes.length;
      }
    }
    vizinhos[i] = [...comb.entries()]
      .map(([j, e]) => [j, (1 - gama) * e.cf + gama * e.cont, e.conf, e.lift])
      .sort((a, b) => b[1] - a[1])
      .slice(0, K);
  }
  return { vizinhos, regras, kappa: kappaPorFonte };
}

function construirItemItem(dados, p) {
  const { n, U, curtidas, co } = dados;
  const coW = dados.coW || null;
  const nW = dados.curtidasW || curtidas;
  const alfa = p.alfa ?? 0.5;
  const regras = { total: 0, melhores: [] };
  const suporteMinRelatorio = Math.max(p.minCoocorrencia, U * 0.01);
  const potB = new Float64Array(n);
  for (let j = 0; j < n; j++) potB[j] = Math.pow(nW[j], alfa);

  const cf = new Array(n);
  for (let i = 0; i < n; i++) {
    const ni = curtidas[i];
    if (!ni) {
      cf[i] = [];
      continue;
    }
    const lista = [];
    const ai = Math.pow(nW[i], 1 - alfa);
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const pos = posicaoPar(i, j, n);
      const c = co[pos];
      if (c < p.minCoocorrencia) continue;
      const cw = coW ? coW[pos] : c;
      const sim = (cw / (ai * potB[j])) * (c / (c + p.encolhimento));
      const confianca = c / ni;
      const lift = (c * U) / (ni * curtidas[j]);
      lista.push([j, sim, confianca, lift]);
      if (confianca >= p.minConfianca && lift >= p.minLift) {
        regras.total++;
        if (c >= suporteMinRelatorio) regras.melhores.push({ de: i, para: j, suporte: c / U, confianca, lift });
      }
    }
    lista.sort((a, b) => b[1] - a[1]);
    cf[i] = lista.slice(0, Math.max(p.vizinhosPorFilme, MANTER));
    if (regras.melhores.length > 5000) regras.melhores = regras.melhores.sort((a, b) => b.lift - a.lift).slice(0, 1000);
  }
  regras.melhores = regras.melhores.filter((r) => r.confianca >= 0.5).sort((a, b) => b.lift - a.lift).slice(0, 50);
  return { cf, regras };
}

/**
 * EASE (Embarrassingly Shallow Autoencoder). Inverte (XᵀX + λI) por Gauss-Jordan (matriz simétrica
 * positiva definida: não precisa de pivoteamento). Custo ~n³ operações: com ~6 mil filmes, ~6 minutos.
 * As regras de associação (confiança/lift) continuam vindo das contagens simples.
 */
export function construirEase(dados, p, dirCache) {
  const { n, U, curtidas, co } = dados;
  const coW = dados.coW || null;
  const nW = dados.curtidasW || curtidas;
  const lambda = p.easeLambda;
  const manter = Math.max(p.vizinhosPorFilme, MANTER);
  const arquivo = dirCache ? path.join(dirCache, `ease-l${lambda}-r${p.meiaVidaPessoaDias || 0}-n${n}-k${manter}.json`) : null;
  // Mesmas regras de associação do item-item (dependem só das contagens)
  const regrasDeContagem = () => construirItemItem(dados, { ...p, alfa: 0.5, vizinhosPorFilme: 1 }).regras;
  if (arquivo && existsSync(arquivo)) return { cf: JSON.parse(readFileSync(arquivo, 'utf8')), regras: regrasDeContagem() };

  const A = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    A[i * n + i] = nW[i] + lambda;
    for (let j = i + 1; j < n; j++) {
      const pos = posicaoPar(i, j, n);
      const c = coW ? coW[pos] : co[pos];
      A[i * n + j] = c;
      A[j * n + i] = c;
    }
  }
  const inicio = Date.now();
  for (let k = 0; k < n; k++) {
    const linhaK = A.subarray(k * n, k * n + n);
    const inv = 1 / linhaK[k];
    linhaK[k] = 1;
    for (let j = 0; j < n; j++) linhaK[j] *= inv;
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const off = i * n;
      const f = A[off + k];
      if (f === 0) continue;
      A[off + k] = 0;
      for (let j = 0; j < n; j++) A[off + j] -= f * linhaK[j];
    }
    if (k % 500 === 0 && process.stdout.isTTY) process.stdout.write(`\r   EASE: invertendo… ${Math.round((k / n) * 100)}%`);
  }
  if (process.stdout.isTTY) process.stdout.write('\r');
  console.log(`   EASE: matriz ${n}×${n} invertida em ${((Date.now() - inicio) / 1000).toFixed(0)}s (λ = ${lambda})`);

  const cf = new Array(n);
  for (let i = 0; i < n; i++) {
    const lista = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const b = -A[i * n + j] / A[j * n + j];
      if (b <= 0) continue;
      const c = co[posicaoPar(i, j, n)];
      lista.push([j, b, curtidas[i] ? c / curtidas[i] : 0, curtidas[i] && curtidas[j] ? (c * U) / (curtidas[i] * curtidas[j]) : 0]);
    }
    lista.sort((a, b) => b[1] - a[1]);
    cf[i] = lista.slice(0, manter).map(([j, b, conf, lift]) => [j, Math.round(b * 1e6) / 1e6, Math.round(conf * 1e4) / 1e4, Math.round(lift * 1e3) / 1e3]);
  }
  if (arquivo) writeFileSync(arquivo, JSON.stringify(cf));
  return { cf, regras: regrasDeContagem() };
}

export { posicaoPar };
