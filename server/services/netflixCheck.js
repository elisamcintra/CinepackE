// Regra de ouro: NADA aparece no catálogo sem estar verificado na Netflix Brasil.
//
// Como funciona:
//  1. A busca no TMDB (/discover) já vem filtrada por "Netflix + Brasil + assinatura".
//  2. Mesmo assim, cada candidato passa por uma checagem individual: getTitle() traz os
//     provedores de streaming do título e só aceitamos se a Netflix estiver em BR.flatrate.
//  3. getTitle() fica em cache por 24h, então a verificação é refeita uma vez por dia.
//
// Os dados de disponibilidade vêm do JustWatch (via TMDB).

import { discover, getTitle, keywordId } from './tmdbService.js';
import { generoPorChave } from '../lib/genres.js';
import { mapLimit } from '../lib/limit.js';

export const chaveTitulo = (tipo, id) => `${tipo}:${id}`;

// Verifica uma lista de referências {tipo, id} e devolve só os disponíveis na Netflix BR
export async function verificarVarios(refs, filtroExtra) {
  const detalhes = await mapLimit(refs, 8, (r) => getTitle(r.tipo, r.id));
  return detalhes.filter((t) => t && t.netflix.disponivel && (!filtroExtra || filtroExtra(t)));
}

export async function estaNaNetflix(tipo, id) {
  const t = await getTitle(tipo, id);
  return !!t?.netflix.disponivel;
}

// Converte classificação indicativa do Brasil em número (L = 0)
export function classificacaoNumero(c) {
  if (!c) return null;
  if (/^a?l$/i.test(c)) return 0;
  const n = parseInt(c, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Traduz uma "consulta" do app para os parâmetros do /discover do TMDB.
 * consulta = {
 *   tipo: 'movie' | 'tv',
 *   generos: ['scifi', ...]          (qualquer um deles: OU)
 *   excluirGeneros: ['romance', ...]
 *   palavrasChave: [ids do TMDB]     (qualquer uma: OU)
 *   idiomas: ['ko', 'ja']            (idioma original: OU)
 *   anoMin, anoMax, duracaoMin, duracaoMax (min, só filmes),
 *   notaMin, votosMin, votosMax, classificacaoMax ('L','10'... só filmes),
 *   ordenar: 'popularidade' | 'nota' | 'recentes'
 * }
 */
export async function montarParametrosDiscover(c) {
  const tipo = c.tipo;
  const p = {};

  // Gêneros desejados. Em séries, alguns gêneros não existem e viram palavra-chave.
  const generoIds = [];
  const kwGeneros = [];
  for (const chave of c.generos || []) {
    const g = generoPorChave(chave);
    if (!g) continue;
    if (g[tipo].length) generoIds.push(...g[tipo]);
    else if (tipo === 'tv' && g.tvKeyword) {
      const id = await keywordId(g.tvKeyword).catch(() => null);
      if (id) kwGeneros.push(id);
    }
  }
  if (generoIds.length) p.with_genres = [...new Set(generoIds)].join('|');

  const kws = [...(c.palavrasChave || [])];
  // Só usa a palavra-chave "substituta" de gênero se não houver gênero real
  // (o TMDB combina with_genres E with_keywords, o que ficaria restritivo demais)
  if (!generoIds.length) kws.push(...kwGeneros);
  if (kws.length) p.with_keywords = [...new Set(kws)].join('|');

  // Gêneros a excluir
  const semGeneros = [];
  const semKws = [];
  for (const chave of c.excluirGeneros || []) {
    const g = generoPorChave(chave);
    if (!g) continue;
    if (g[tipo].length) {
      // Em séries, "Sci-Fi & Fantasy" é um gênero só: excluir "fantasia" não pode excluir ficção científica desejada
      const ids = g[tipo].filter((id) => !generoIds.includes(id));
      semGeneros.push(...ids);
    } else if (tipo === 'tv' && g.tvKeyword) {
      const id = await keywordId(g.tvKeyword).catch(() => null);
      if (id) semKws.push(id);
    }
  }
  if (semGeneros.length) p.without_genres = [...new Set(semGeneros)].join(',');
  if (semKws.length) p.without_keywords = semKws.join(',');

  if (c.idiomas?.length) p.with_original_language = c.idiomas.join('|');

  const campoData = tipo === 'movie' ? 'primary_release_date' : 'first_air_date';
  if (c.anoMin) p[`${campoData}.gte`] = `${c.anoMin}-01-01`;
  if (c.anoMax) p[`${campoData}.lte`] = `${c.anoMax}-12-31`;

  if (tipo === 'movie') {
    if (c.duracaoMin) p['with_runtime.gte'] = c.duracaoMin;
    if (c.duracaoMax) p['with_runtime.lte'] = c.duracaoMax;
    if (c.classificacaoMax) {
      p.certification_country = 'BR';
      p['certification.lte'] = c.classificacaoMax;
    }
  }

  if (c.notaMin) p['vote_average.gte'] = c.notaMin;
  p['vote_count.gte'] = c.votosMin ?? 50;
  if (c.votosMax) p['vote_count.lte'] = c.votosMax;

  const ordens = {
    popularidade: 'popularity.desc',
    nota: 'vote_average.desc',
    recentes: `${campoData}.desc`,
  };
  p.sort_by = ordens[c.ordenar] || 'popularity.desc';
  // "Mais recentes" sem limite traria lançamentos futuros
  if (c.ordenar === 'recentes' && !c.anoMax) p[`${campoData}.lte`] = new Date().toISOString().slice(0, 10);

  return p;
}

/**
 * Busca títulos no /discover e verifica um por um, página por página,
 * até juntar `alvo` itens disponíveis (ou acabar as páginas).
 */
export async function descobrirVerificados(consulta, { alvo = 15, excluir = new Set(), maxPaginas = 4, filtroExtra } = {}) {
  const params = await montarParametrosDiscover(consulta);
  const itens = [];
  const vistos = new Set();

  for (let page = 1; page <= maxPaginas && itens.length < alvo; page++) {
    const { results, total_pages } = await discover(consulta.tipo, params, page);
    const novos = results.filter((r) => {
      const k = chaveTitulo(consulta.tipo, r.id);
      if (excluir.has(k) || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    const ok = await verificarVarios(novos.map((r) => ({ tipo: consulta.tipo, id: r.id })), filtroExtra);
    itens.push(...ok);
    if (page >= total_pages) break;
  }
  return itens;
}
