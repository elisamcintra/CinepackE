// Avaliação offline do componente MovieLens (protocolo aprovado na Fase 1).
//
// Protocolo principal: até 3.000 pessoas do conjunto (teste ou validação), semente fixa (semente + 1).
//   Para cada pessoa com >= 5 curtidas, as curtidas são embaralhadas e 20% ficam ESCONDIDAS.
//   O modelo recebe o resto (as outras notas da pessoa) e devolve 10 filmes, nunca um que ela já avaliou.
//   Métricas: HitRate@10, Precision@10, Recall@10, NDCG@10, popularidade média, posição média no ranking
//   de popularidade e cobertura do catálogo.
// Cold start: pessoas com >= 50 curtidas (semente + 2); 10 curtidas escondidas; base com 1, 3, 5, 10, 20 e 40.
//
// Como a pessoa pesa (igual ao app, ver server/services/movielensBase.js):
//   binario  só as curtidas, peso 1 (modelo original)
//   notas    todas as notas, peso (nota − 3) / 2  → 5★ = +1 … 1★ = −1 (notas baixas EMPURRAM para baixo)
//   recência r = 0,5 + 0,5 · 2^(−dias/meia-vida), contando a partir da última nota da pessoa

import { paraCadaTransacao } from './etapa3-transformacao.js';
import { criarAleatorio, lerBinario } from './util.js';

const K = 10;
const log2 = (x) => Math.log(x) / Math.LN2;

// Lê curtidas + notas completas do conjunto, na mesma ordem
export function carregarConjunto(cfg, nome) {
  const curtidas = lerBinario(cfg.dirProcessado, `etapa3-${nome}.bin`, Int32Array);
  const notas = lerBinario(cfg.dirProcessado, `etapa3-${nome}-notas.bin`, Int32Array);
  const pessoas = [];
  paraCadaTransacao(curtidas, (c) => pessoas.push({ curtidas: Array.from(c) }));
  let i = 0;
  paraCadaTransacao(notas, (v) => {
    const lista = [];
    for (let k = 1; k < v.length; k += 3) lista.push({ filme: v[k], nota: v[k + 1] / 2, dia: v[k + 2] });
    pessoas[i].media = v[0] / 1000;
    pessoas[i].notas = lista;
    i++;
  });
  if (i !== pessoas.length) throw new Error(`Conjunto ${nome}: curtidas e notas desalinhadas. Rode a etapa 3 de novo.`);
  return pessoas;
}

function pesoDa(nota, dia, diaRef, p) {
  const s = p.pesoUsuario === 'notas' ? (nota - 3) / 2 : 1;
  const r = p.meiaVidaUsuarioDias > 0 ? 0.5 + 0.5 * Math.pow(2, -(diaRef - dia) / p.meiaVidaUsuarioDias) : 1;
  return s * r;
}

// Recomenda a partir de uma base [{ filme, peso }] usando as listas de vizinhos
export function recomendar(vizinhos, base, excluir, k = K) {
  const pont = new Map();
  for (const { filme, peso } of base) {
    if (!peso) continue;
    for (const [j, sim] of vizinhos[filme] || []) {
      if (excluir.has(j)) continue;
      pont.set(j, (pont.get(j) || 0) + peso * sim);
    }
  }
  return [...pont.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, k).map(([j]) => j);
}

function acumulador() {
  return { hit: 0, prec: 0, rec: 0, ndcg: 0, popMedia: 0, popRank: 0, cobertura: new Set(), vazias: 0, n: 0 };
}

function somar(a, top, escondidos, ctx) {
  a.n++;
  if (!top.length) a.vazias++;
  let acertos = 0;
  let dcg = 0;
  top.forEach((j, i) => {
    a.cobertura.add(j);
    if (escondidos.has(j)) {
      acertos++;
      dcg += 1 / log2(i + 2);
    }
  });
  let idcg = 0;
  for (let i = 0; i < Math.min(escondidos.size, K); i++) idcg += 1 / log2(i + 2);
  a.hit += acertos > 0 ? 1 : 0;
  a.prec += acertos / K;
  a.rec += acertos / escondidos.size;
  a.ndcg += dcg / idcg;
  if (top.length) {
    a.popMedia += top.reduce((s, j) => s + ctx.curtidas[j] / ctx.U, 0) / top.length;
    a.popRank += top.reduce((s, j) => s + ctx.rankPop[j] / ctx.n, 0) / top.length;
  }
}

function resultado(a, n) {
  return {
    pessoas: a.n,
    hit_rate_10: a.hit / a.n,
    precision_10: a.prec / a.n,
    recall_10: a.rec / a.n,
    ndcg_10: a.ndcg / a.n,
    popularidade_media: a.popMedia / a.n, // fração média de pessoas que gostaram dos recomendados
    posicao_popularidade: a.popRank / a.n, // 0 = o mais popular; 0,009 = top 0,9%
    cobertura: a.cobertura.size / n,
    listas_vazias: a.vazias,
  };
}

const embaralhar = (lista, sorteio) => {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
};

/**
 * Avalia listas de vizinhos num conjunto (teste ou validação).
 * mineracao = { vizinhos, curtidas, U }; p = parâmetros (pesoUsuario, meiaVidaUsuarioDias, semente, ...)
 */
export function avaliar(pessoas, mineracao, p, { coldStart = true } = {}) {
  const { curtidas, U } = mineracao;
  // Modelo por tamanho da base: com vizinhosGrandes e minimoGrandes, bases >= mínimo usam a outra lista (ex.: EASE)
  const listaPara = (tamanho) => (mineracao.vizinhosGrandes && tamanho >= mineracao.minimoGrandes ? mineracao.vizinhosGrandes : mineracao.vizinhos);
  const n = curtidas.length;
  const pop = [...Array(n).keys()].sort((a, b) => curtidas[b] - curtidas[a]);
  const rankPop = new Int32Array(n);
  pop.forEach((j, r) => (rankPop[j] = r));
  const ctx = { curtidas, U, rankPop, n };
  const maisPopulares = (excluir) => {
    const out = [];
    for (const j of pop) {
      if (!excluir.has(j)) out.push(j);
      if (out.length === K) break;
    }
    return out;
  };

  // ---------- Protocolo principal ----------
  const sorteio = criarAleatorio(p.semente + 1);
  const modelo = acumulador();
  const base = acumulador();
  let avaliadas = 0;
  for (const pessoa of pessoas) {
    if (pessoa.curtidas.length < 5 || avaliadas >= p.maxUsuariosAvaliacao) continue;
    avaliadas++;
    const l = embaralhar([...pessoa.curtidas], sorteio);
    const q = Math.max(1, Math.round(l.length * p.fracaoEscondida));
    const escondidos = new Set(l.slice(0, q));
    const visiveis = new Set(l.slice(q));
    const diaRef = Math.max(...pessoa.notas.map((x) => x.dia));
    // O que o modelo "sabe" da pessoa: as curtidas visíveis (binário) ou todas as notas visíveis (notas)
    const conhecidas = pessoa.notas.filter((x) => !escondidos.has(x.filme));
    let usadas = p.pesoUsuario === 'notas' ? conhecidas : conhecidas.filter((x) => visiveis.has(x.filme));
    // Simula o app antigo: só os N "favoritos" (maior nota, depois os mais recentes)
    if (p.limiteBase > 0) usadas = [...usadas].sort((x, y) => y.nota - x.nota || y.dia - x.dia).slice(0, p.limiteBase);
    const baseP = usadas.map((x) => ({ filme: x.filme, peso: pesoDa(x.nota, x.dia, diaRef, p) }));
    const excluir = new Set(conhecidas.map((x) => x.filme)); // nunca recomenda o que a pessoa já avaliou
    somar(modelo, recomendar(listaPara(baseP.length), baseP, excluir), escondidos, ctx);
    somar(base, maisPopulares(excluir), escondidos, ctx);
  }
  const saida = { modelo: resultado(modelo, n), populares: resultado(base, n) };

  // ---------- Curva de cold start ----------
  if (coldStart) {
    const KS = [1, 3, 5, 10, 20, 40];
    const acc = Object.fromEntries(KS.map((k) => [k, acumulador()]));
    const accPop = acumulador();
    const s2 = criarAleatorio(p.semente + 2);
    let q = 0;
    for (const pessoa of pessoas) {
      if (pessoa.curtidas.length < 50 || q >= p.maxUsuariosAvaliacao) continue;
      q++;
      const l = embaralhar([...pessoa.curtidas], s2);
      const escondidos = new Set(l.slice(0, 10));
      const resto = l.slice(10);
      const porFilme = new Map(pessoa.notas.map((x) => [x.filme, x]));
      const diaRef = Math.max(...pessoa.notas.map((x) => x.dia));
      for (const k of KS) {
        const conhecidas = resto.slice(0, k).map((f) => porFilme.get(f));
        const baseK = conhecidas.map((x) => ({ filme: x.filme, peso: pesoDa(x.nota, x.dia, diaRef, p) }));
        somar(acc[k], recomendar(listaPara(baseK.length), baseK, new Set(resto.slice(0, k))), escondidos, ctx);
      }
      somar(accPop, maisPopulares(new Set(resto.slice(0, 40))), escondidos, ctx);
    }
    saida.cold_start = Object.fromEntries(KS.map((k) => [k, resultado(acc[k], n)]));
    saida.cold_start_populares = resultado(accPop, n);
  }
  return saida;
}
