// BASE DO MOVIELENS: todos os filmes da pessoa que existem na mineração, cada um com um peso explícito.
// (Regras aprovadas na Fase 1: nenhum limite de favoritos; mínimo de 20 títulos; peso com histórico,
//  notas, "Não me interessa" e recência.)
//
// Peso de cada título:  w = s × r
//   s (sinal) — a informação explícita vence a implícita (nota > "Não me interessa" > histórico):
//       nota no app            (nota − 3) / 2    → 5★ = +1 · 4★ = +0,5 · 3★ = 0 · 2★ = −0,5 · 1★ = −1
//       "Não me interessa"     −0,6
//       só histórico, 1 vez    +0,4
//       só histórico, 2+ vezes +0,8
//   r (recência) = 0,5 + 0,5 × 2^(−dias / 730)   → hoje 1,0 · 2 anos 0,75 · 4 anos 0,625 · nunca abaixo de 0,5
//       dias = desde a última vez que viu (histórico) ou desde a nota; sem data, r = 0,5.
//
// Mínimo de 20 títulos: com menos, os pontos do MovieLens são multiplicados por α = N / 20
// e um aviso aparece (com poucos títulos o sinal vale pouco mais que "os mais populares").
//
// Séries não entram: o MovieLens só tem filmes.

import { semNome } from '../../src/modules/cinematch/lib/nomesHistorico.js';
import * as movielens from './movielensService.js';

export const MINIMO_BASE = 20;
export const MEIA_VIDA_DIAS = 730;
export const SINAL = { nao_interessa: -0.6, historico_1: 0.4, historico_2: 0.8 };

const DIA_MS = 86400000;
const arred = (v) => Math.round(v * 1000) / 1000;

export function recencia(data, agora = new Date()) {
  const t = data ? new Date(data).getTime() : NaN;
  if (!Number.isFinite(t)) return 0.5;
  const dias = Math.max(0, (agora.getTime() - t) / DIA_MS);
  return 0.5 + 0.5 * Math.pow(2, -dias / MEIA_VIDA_DIAS);
}

export function sinalDaNota(nota) {
  return (nota - 3) / 2;
}

/**
 * Monta a base a partir do histórico importado e dos títulos marcados no app.
 * historico: linhas de watch_history_import; titulos: linhas de user_titles.
 * Devolve { itens: [{ tmdb_id, titulo, fonte, s, r, w, data }], disponiveis, minimo, alfa, aviso }.
 */
export function montarBase({ historico = [], titulos = [] }, agora = new Date()) {
  const porFilme = new Map();
  const conhece = (id) => movielens.conhece(id);

  // 1. Histórico (implícito)
  for (const h of historico) {
    if (h.tipo !== 'movie' || !h.tmdb_id || semNome(h.titulo_original) || !conhece(h.tmdb_id)) continue;
    const vezes = Number(h.vezes) || 1;
    const atual = porFilme.get(h.tmdb_id);
    if (atual && atual.vezes >= vezes) continue;
    porFilme.set(h.tmdb_id, {
      tmdb_id: h.tmdb_id,
      titulo: h.titulo_tmdb || h.titulo_original,
      fonte: vezes >= 2 ? 'historico_2' : 'historico_1',
      s: vezes >= 2 ? SINAL.historico_2 : SINAL.historico_1,
      data: h.ultima_data || null,
      vezes,
    });
  }

  // 2. App (explícito: vence o histórico)
  for (const t of titulos) {
    if (t.tipo !== 'movie' || !conhece(t.tmdb_id)) continue;
    const titulo = t.dados?.titulo || porFilme.get(t.tmdb_id)?.titulo || movielens.tituloOriginal(t.tmdb_id);
    if (t.status === 'ja_vi' && t.nota) {
      porFilme.set(t.tmdb_id, { tmdb_id: t.tmdb_id, titulo, fonte: 'nota', nota: t.nota, s: sinalDaNota(t.nota), data: t.atualizado_em || null });
    } else if (t.status === 'nao_interessa') {
      porFilme.set(t.tmdb_id, { tmdb_id: t.tmdb_id, titulo, fonte: 'nao_interessa', s: SINAL.nao_interessa, data: t.atualizado_em || null });
    } else if (t.status === 'ja_vi' && !porFilme.has(t.tmdb_id)) {
      // Marcou "Já vi" sem nota e sem histórico: conta como visto 1 vez
      porFilme.set(t.tmdb_id, { tmdb_id: t.tmdb_id, titulo, fonte: 'historico_1', s: SINAL.historico_1, data: t.atualizado_em || null });
    }
  }

  const itens = [...porFilme.values()]
    .map((x) => {
      const r = recencia(x.data, agora);
      return { ...x, r: arred(r), w: arred(x.s * r) };
    })
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w));

  const n = itens.length;
  const alfa = n >= MINIMO_BASE ? 1 : n / MINIMO_BASE;
  const aviso =
    n === 0
      ? 'Nenhum filme seu existe na base do MovieLens ainda: este componente está desligado. Avalie alguns filmes para ativá-lo.'
      : n < MINIMO_BASE
        ? `O MovieLens está usando ${n} de ${MINIMO_BASE} títulos mínimos: o peso dele foi reduzido para ${Math.round(alfa * 100)}%. Avalie mais filmes para aumentar.`
        : null;
  return { itens, disponiveis: n, minimo: MINIMO_BASE, alfa: arred(alfa), aviso };
}

// Lê do banco (cliente do próprio usuário) e monta a base
export async function carregarBase(db, agora = new Date()) {
  const [hist, tit] = await Promise.all([
    db.from('watch_history_import').select('titulo_original, titulo_tmdb, tmdb_id, tipo, vezes, ultima_data, peso').limit(5000),
    db.from('user_titles').select('tmdb_id, tipo, status, nota, dados, atualizado_em').limit(5000),
  ]);
  for (const r of [hist, tit]) if (r.error) throw r.error;
  return montarBase({ historico: hist.data || [], titulos: tit.data || [] }, agora);
}
