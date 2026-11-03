// COMPONENTE DE SÉRIES: pontua séries parecidas com as que a pessoa gostou, com duas fontes:
//   1. Conteúdo (TMDB): sinopse, temas, gêneros, criadores, elenco e origem, em TF-IDF (seriesConteudo.js);
//   2. Trakt: as séries "relacionadas" de cada série da pessoa (traktService.js).
//
// Regras (para não repetir o erro do MovieLens, que existia mas não era usado):
//   - BASE: TODAS as séries da pessoa entram, cada uma com o seu peso. Nenhum limite (nada de top 12 ou 60).
//       nota no app (vale mais que tudo): (nota − 3) ÷ 2  → 5★ = +1, 1★ = −1, 3★ = 0 (neutra)
//       "Não me interessa": −0,6
//       histórico: o peso da importação (1 / 0,7 / 0,4 pelos episódios vistos; −0,3 = largou no começo)
//       "Já vi" marcado no app, sem nota e fora do histórico: +0,4
//   - CANDIDATOS: o catálogo INTEIRO de séries da Netflix BR (~3.500), mais qualquer série que chegue por outra fonte.
//   - SÓ SÉRIES: filmes nunca recebem estes pontos (são contados como descartados).
//
// Fórmulas, para um candidato c e as séries j da pessoa (peso w_j):
//   conteúdo  S_c = Σ w_j · sim(c, j)^p ÷ Σ |w_j|         (p = 2: as séries mais parecidas mandam no sinal)
//   Trakt     S_t = Σ w_j · r_j(c)     ÷ Σ |w_j|         (r_j(c) = 1 ÷ log2(posição + 1) se c está na lista de j)
//   pontos = limite(3 · S ÷ P95, −1,5, +3), com P95 = percentil 95 dos S positivos no catálogo, e depois
//   CENTRADOS na média do catálogo: a série média ganha 0, então as séries não passam a valer mais que os filmes
//   só por terem um componente a mais.

import { semNome } from '../../src/modules/cinematch/lib/nomesHistorico.js';
import { fichasDasSeries } from './seriesFichas.js';
import { montarIndice, similaridadeSeries } from './seriesConteudo.js';
import { catalogoSeriesNetflix } from './tmdbService.js';
import { relacionadasDasSeries, traktDisponivel } from './traktService.js';

export const ESCALA_SERIES = { p: 2, conteudo: true, trakt: true, centrar: true };
const PONTOS_MAX = 3;
const PONTOS_MIN = -1.5;
const CONTRIBUINTES = 5; // só para MOSTRAR no rastreamento; o cálculo usa todas as séries

const arred = (v, casas = 4) => Math.round(v * 10 ** casas) / 10 ** casas;

/** Base de séries da pessoa: TODAS as séries, cada uma com o seu peso (ver as regras no topo). */
export function montarBaseSeries({ historico = [], titulos = [] } = {}) {
  const porId = new Map();
  for (const h of historico) {
    if (h.tipo !== 'tv' || !h.tmdb_id || semNome(h.titulo_original)) continue;
    const w = Number(h.peso) || 0;
    const atual = porId.get(h.tmdb_id);
    // A mesma série pode vir de mais de uma linha do CSV: vale o maior peso (o que a pessoa mais assistiu)
    if (!atual || w > atual.w) porId.set(h.tmdb_id, { tmdb_id: h.tmdb_id, titulo: h.titulo_tmdb || h.titulo_original, w, fonte: 'historico' });
  }
  for (const t of titulos) {
    if (t.tipo !== 'tv' || !t.tmdb_id) continue;
    const atual = porId.get(t.tmdb_id);
    const titulo = t.dados?.titulo || atual?.titulo || '';
    if (t.status === 'ja_vi' && t.nota) porId.set(t.tmdb_id, { tmdb_id: t.tmdb_id, titulo, w: (t.nota - 3) / 2, fonte: 'nota' });
    else if (t.status === 'nao_interessa') porId.set(t.tmdb_id, { tmdb_id: t.tmdb_id, titulo, w: -0.6, fonte: 'nao_interessa' });
    else if (t.status === 'ja_vi' && !atual) porId.set(t.tmdb_id, { tmdb_id: t.tmdb_id, titulo, w: 0.4, fonte: 'ja_vi' });
  }
  const itens = [...porId.values()];
  return {
    itens,
    total: itens.length,
    positivas: itens.filter((x) => x.w > 0).length,
    negativas: itens.filter((x) => x.w < 0).length,
    neutras: itens.filter((x) => x.w === 0).length,
  };
}

export async function carregarBaseSeries(db) {
  const [hist, titulos] = await Promise.all([
    db.from('watch_history_import').select('titulo_original, titulo_tmdb, tmdb_id, tipo, peso').eq('tipo', 'tv').limit(5000),
    db.from('user_titles').select('tmdb_id, tipo, status, nota, dados').eq('tipo', 'tv').limit(5000),
  ]);
  for (const r of [hist, titulos]) if (r.error) throw r.error;
  return montarBaseSeries({ historico: hist.data || [], titulos: titulos.data || [] });
}

/**
 * Prepara o componente para uma pessoa: catálogo da Netflix BR, fichas (conteúdo), índice TF-IDF e as listas
 * do Trakt de cada série dela. Tudo com cache (catálogo 12h, fichas 30 dias, Trakt 30 dias).
 * opcoes.extras: outras séries que precisam de ficha (ex.: os candidatos da avaliação).
 */
export async function prepararSeries(base, { extras = [] } = {}) {
  const catalogo = await catalogoSeriesNetflix();
  const idsCatalogo = catalogo.series.map((s) => s.id);
  const comPeso = base.itens.filter((x) => x.w !== 0);
  const fichas = await fichasDasSeries([...idsCatalogo, ...base.itens.map((x) => x.tmdb_id), ...extras]);
  const indice = montarIndice([...fichas.values()]);

  const listas = traktDisponivel() ? await relacionadasDasSeries(comPeso) : new Map();
  const relacoes = new Map(); // série da pessoa -> Map(candidato -> r)
  for (const j of comPeso) {
    const r = listas.get(Number(j.tmdb_id));
    if (r?.itens?.length) relacoes.set(j.tmdb_id, new Map(r.itens.map((it, i) => [it.tmdb_id, 1 / Math.log2(i + 2)])));
  }
  return {
    base,
    comPeso,
    somaPesos: comPeso.reduce((a, x) => a + Math.abs(x.w), 0),
    catalogo,
    idsCatalogo,
    fichas,
    indice,
    relacoes,
    trakt: { disponivel: traktDisponivel(), consultadas: comPeso.length, com_lista: relacoes.size },
    escalas: new Map(), // por p: { refC, mediaC, refT, mediaT } medidas no catálogo
    brutos: new Map(),
  };
}

// S de conteúdo e do Trakt para um candidato, com quem contribuiu (memorizado: o catálogo é medido uma vez)
function sinalBruto(prep, id, p) {
  const chave = `${p}:${id}`;
  if (!prep.brutos.has(chave)) prep.brutos.set(chave, calcularBruto(prep, id, p));
  return prep.brutos.get(chave);
}

function calcularBruto(prep, id, p) {
  const vc = prep.indice.vetor(id);
  let sc = 0;
  let st = 0;
  const contC = [];
  const contT = [];
  for (const j of prep.comPeso) {
    if (j.tmdb_id === id) continue;
    if (vc) {
      const sim = similaridadeSeries(vc, prep.indice.vetor(j.tmdb_id));
      if (sim && sim.total > 0) {
        const c = j.w * sim.total ** p;
        sc += c;
        contC.push({ tmdb_id: j.tmdb_id, titulo: j.titulo, peso: j.w, sim: sim.total, contribuicao: c });
      }
    }
    const r = prep.relacoes.get(j.tmdb_id)?.get(id);
    if (r) {
      st += j.w * r;
      contT.push({ tmdb_id: j.tmdb_id, titulo: j.titulo, peso: j.w, posicao: Math.round(2 ** (1 / r) - 1), contribuicao: j.w * r });
    }
  }
  const div = prep.somaPesos || 1;
  return { sc: sc / div, st: st / div, contC, contT, temFicha: !!vc };
}

const percentil = (lista, q) => {
  if (!lista.length) return 0;
  const o = [...lista].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor(q * o.length))];
};
const paraPontos = (s, ref) => (ref > 0 ? Math.max(PONTOS_MIN, Math.min(PONTOS_MAX, (3 * s) / ref)) : 0);

// Escala medida no catálogo inteiro (as séries que a pessoa já tem ficam de fora)
function escalaDoCatalogo(prep, p) {
  if (prep.escalas.has(p)) return prep.escalas.get(p);
  const daPessoa = new Set(prep.base.itens.map((x) => x.tmdb_id));
  const brutos = prep.idsCatalogo.filter((id) => !daPessoa.has(id)).map((id) => sinalBruto(prep, id, p));
  const refC = percentil(brutos.filter((b) => b.sc > 0).map((b) => b.sc), 0.95);
  const refT = percentil(brutos.filter((b) => b.st > 0).map((b) => b.st), 0.95);
  const media = (f) => (brutos.length ? brutos.reduce((a, b) => a + f(b), 0) / brutos.length : 0);
  const e = { refC, refT, mediaC: media((b) => paraPontos(b.sc, refC)), mediaT: media((b) => paraPontos(b.st, refT)), avaliadas: brutos.length };
  prep.escalas.set(p, e);
  return e;
}

/**
 * Sinais do componente para uma lista de candidatos. Só séries recebem sinal; o resto é contado como descartado.
 * Devolve { sinais: Map(tmdb_id -> { conteudo, trakt, catalogo_avaliado }), descartados_nao_serie }.
 */
export async function sinaisDeSeries(prep, candidatos, escala = ESCALA_SERIES) {
  const series = candidatos.filter((t) => t?.tipo === 'tv' && t.tmdb_id);
  const descartados = candidatos.length - series.length;
  // Séries que chegaram por outras fontes e ainda não têm ficha
  const semFicha = series.map((t) => t.tmdb_id).filter((id) => !prep.fichas.has(id));
  if (semFicha.length) {
    const novas = await fichasDasSeries(semFicha);
    for (const [id, f] of novas) {
      prep.fichas.set(id, f);
      prep.indice.adicionar(f);
    }
  }
  const p = escala.p ?? ESCALA_SERIES.p;
  const e = escalaDoCatalogo(prep, p);
  const sinais = new Map();
  for (const t of series) {
    const b = sinalBruto(prep, t.tmdb_id, p);
    const ordenar = (l) =>
      l
        .sort((x, y) => Math.abs(y.contribuicao) - Math.abs(x.contribuicao))
        .slice(0, CONTRIBUINTES)
        .map((c) => ({ ...c, sim: c.sim !== undefined ? arred(c.sim) : undefined, contribuicao: arred(c.contribuicao / (prep.somaPesos || 1), 5) }));
    const pc = escala.conteudo === false ? 0 : paraPontos(b.sc, e.refC) - (escala.centrar === false ? 0 : e.mediaC);
    const pt = escala.trakt === false ? 0 : paraPontos(b.st, e.refT) - (escala.centrar === false ? 0 : e.mediaT);
    sinais.set(t.tmdb_id, {
      conteudo: { S: arred(b.sc, 5), pontos: arred(pc, 3), ativo: escala.conteudo !== false, tem_ficha: b.temFicha, contribuintes: ordenar(b.contC) },
      trakt: { S: arred(b.st, 5), pontos: arred(pt, 3), ativo: escala.trakt !== false && prep.trakt.disponivel, ligacoes: b.contT.length, contribuintes: ordenar(b.contT) },
      catalogo_avaliado: e.avaliadas,
    });
  }
  return { sinais, descartados_nao_serie: descartados };
}

/** Um título "leve" a partir do catálogo + ficha: tudo o que a pontuação precisa, sem chamar o TMDB de novo. */
export function tituloDoCatalogo(s, ficha, verificadoEm) {
  const f = ficha && !ficha.ausente ? ficha : null;
  return {
    tmdb_id: s.id,
    tipo: 'tv',
    titulo: s.nome,
    titulo_original: s.nome_original,
    ano: s.estreia ? s.estreia.slice(0, 4) : null,
    data_lancamento: s.estreia || null,
    poster_path: s.poster,
    backdrop_path: s.fundo,
    sinopse: s.sinopse || f?.sinopse_en || '',
    sinopse_original: !s.sinopse && !!f?.sinopse_en,
    generos: [],
    genre_ids: s.generos || [],
    duracao: f?.duracao ?? null,
    temporadas: f?.temporadas ?? null,
    episodios: f?.episodios ?? null,
    formato_serie: f?.formato ?? null,
    classificacao: null,
    idioma_original: s.idioma,
    paises: s.paises || [],
    nota_tmdb: s.nota ? Math.round(s.nota * 10) / 10 : null,
    votos: s.votos || 0,
    popularidade: s.popularidade || 0,
    imdb_id: null,
    trailer_key: null,
    palavras_chave: (f?.temas || []).slice(0, 15).map(([id, nome]) => ({ id, nome })),
    diretores: (f?.criadores || []).map(([, nome]) => nome),
    elenco: (f?.elenco || []).slice(0, 10).map(([, nome]) => ({ nome })),
    netflix: { disponivel: true, provedores: ['Netflix'], verificado_em: verificadoEm, fonte: 'catalogo' },
    // Ainda não verificado individualmente: só entra na lista final depois do getTitle (regra de ouro)
    _leve: true,
  };
}
