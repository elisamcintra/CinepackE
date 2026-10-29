// Tudo que conversa com a API do TMDB (v3) passa por aqui.
// Documentação: https://developer.themoviedb.org/reference

import { config } from '../lib/config.js';
import { HttpError } from '../lib/http.js';
import { createLimiter, sleep } from '../lib/limit.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { cached, DIA, HORA } from './cache.js';

const BASE = 'https://api.themoviedb.org/3';
// IDs da Netflix no TMDB: 8 = Netflix, 1796 = Netflix (plano com anúncios)
export const NETFLIX_IDS = [8, 1796];

// No máximo 8 requisições simultâneas ao TMDB
const limitar = createLimiter(8);

async function tmdbFetch(caminho, params = {}) {
  if (!config.tmdbReadToken) {
    throw new HttpError(503, 'TMDB não configurado (preencha TMDB_READ_TOKEN no server/.env).');
  }
  const url = new URL(BASE + caminho);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  return limitar(async () => {
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${config.tmdbReadToken}`, accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) {
        // Muitas requisições: espera um pouco e tenta de novo
        await sleep(800 * (tentativa + 1));
        continue;
      }
      if (res.status === 404) return null;
      if (res.status === 401) throw new HttpError(502, 'Token do TMDB inválido. Confira o TMDB_READ_TOKEN.');
      if (!res.ok) throw new HttpError(502, `O TMDB respondeu com erro (${res.status}). Tente de novo.`);
      return res.json();
    }
    throw new HttpError(503, 'O TMDB está limitando as requisições. Tente de novo em instantes.');
  });
}

// ---------- Busca ----------

// Busca por nome em filmes e séries ao mesmo tempo
export function searchMulti(query, page = 1) {
  const q = query.trim();
  return cached(`tmdb:multi:${q.toLowerCase()}:${page}`, 30 * DIA, async () => {
    const data = await tmdbFetch('/search/multi', { query: q, language: 'pt-BR', include_adult: false, page });
    return (data?.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
  });
}

// Nomes oficiais alternativos de um título (ex.: "A Anatomia de Grey" para "Grey's Anatomy" no Brasil)
export function alternativeTitles(tipo, id) {
  return cached(`tmdb:alt:${tipo}:${id}`, 30 * DIA, async () => {
    const data = await tmdbFetch(`/${tipo}/${id}/alternative_titles`);
    return (data?.titles || data?.results || []).map((t) => t.title).filter(Boolean);
  });
}

// Como keywordId, mas só aceita o nome EXATO (para bloquear temas, nada de "o mais parecido")
export function keywordIdExato(termo) {
  const t = termo.trim().toLowerCase();
  return cached(`tmdb:kw-exato:${t}`, 90 * DIA, async () => {
    const data = await tmdbFetch('/search/keyword', { query: t });
    return (data?.results || []).find((k) => k.name.toLowerCase() === t)?.id ?? null;
  });
}

// Converte um termo (em inglês, ex.: "time travel") no ID de palavra-chave do TMDB
export function keywordId(termo) {
  const t = termo.trim().toLowerCase();
  return cached(`tmdb:kw:${t}`, 90 * DIA, async () => {
    const data = await tmdbFetch('/search/keyword', { query: t });
    const lista = data?.results || [];
    const exato = lista.find((k) => k.name.toLowerCase() === t);
    return (exato || lista[0])?.id ?? null;
  });
}

// ---------- Descoberta (já filtrada pela Netflix BR) ----------

export function discover(tipo, params, page = 1) {
  const p = {
    language: 'pt-BR',
    watch_region: 'BR',
    with_watch_providers: NETFLIX_IDS.join('|'),
    with_watch_monetization_types: 'flatrate',
    include_adult: false,
    ...params,
    page,
  };
  const chave = `tmdb:discover:${tipo}:${JSON.stringify(Object.entries(p).sort())}`;
  return cached(chave, 6 * HORA, async () => {
    const data = await tmdbFetch(`/discover/${tipo}`, p);
    return { results: data?.results || [], total_pages: data?.total_pages || 0 };
  });
}

export function recommendations(tipo, id, page = 1) {
  return cached(`tmdb:recs:${tipo}:${id}:${page}`, 7 * DIA, async () => {
    const data = await tmdbFetch(`/${tipo}/${id}/recommendations`, { language: 'pt-BR', page });
    return (data?.results || []).map((r) => ({ ...r, media_type: tipo }));
  });
}

export function reviews(tipo, id) {
  return cached(`tmdb:reviews:${tipo}:${id}`, 7 * DIA, async () => {
    // As resenhas do TMDB são quase todas em inglês; buscamos as duas línguas
    const [en, pt] = await Promise.all([
      tmdbFetch(`/${tipo}/${id}/reviews`, { language: 'en-US' }),
      tmdbFetch(`/${tipo}/${id}/reviews`, { language: 'pt-BR' }),
    ]);
    const todas = [...(pt?.results || []), ...(en?.results || [])];
    const unicas = [...new Map(todas.map((r) => [r.id, r])).values()];
    return unicas.map((r) => ({
      autor: r.author,
      nota: r.author_details?.rating ?? null,
      texto: r.content,
      data: r.created_at,
      url: r.url,
    }));
  });
}

// ---------- Detalhes completos (com verificação da Netflix) ----------

// UMA chamada traz tudo: detalhes + provedores de streaming + IDs externos + trailer
// + classificação + palavras-chave + elenco (append_to_response).
// O cache dura 24h, então a disponibilidade na Netflix é reverificada a cada dia.
export function getTitle(tipo, id) {
  return cached(`tmdb:title:${tipo}:${id}`, DIA, async () => {
    const extras = [
      'watch/providers',
      'external_ids',
      'videos',
      tipo === 'movie' ? 'release_dates' : 'content_ratings',
      'keywords',
      'credits',
    ].join(',');
    const d = await tmdbFetch(`/${tipo}/${id}`, {
      language: 'pt-BR',
      append_to_response: extras,
      include_video_language: 'pt,en,null',
    });
    if (!d) return null;

    const titulo = normalizar(tipo, d);

    // Sinopse vazia em português? Usa a original em inglês, com aviso no card
    if (!titulo.sinopse) {
      const en = await tmdbFetch(`/${tipo}/${id}`, { language: 'en-US' });
      if (en?.overview) {
        titulo.sinopse = en.overview;
        titulo.sinopse_original = true;
      }
    }

    registrarDisponibilidade(titulo);
    return titulo;
  });
}

// Guarda o resultado da verificação na tabela availability_cache (histórico/consulta)
function registrarDisponibilidade(t) {
  if (!supabaseAdmin) return;
  supabaseAdmin
    .from('availability_cache')
    .upsert({
      tmdb_id: t.tmdb_id,
      tipo: t.tipo,
      na_netflix_br: t.netflix.disponivel,
      provedores: t.netflix.provedores,
      verificado_em: t.netflix.verificado_em,
    })
    .then(({ error }) => error && console.warn('[availability_cache]', error.message));
}

// Transforma a resposta "crua" do TMDB no formato que o app usa
function normalizar(tipo, d) {
  const filme = tipo === 'movie';

  // Provedores no Brasil, plano de assinatura (flatrate)
  const br = d['watch/providers']?.results?.BR;
  const netflix = (br?.flatrate || []).filter(
    (p) => NETFLIX_IDS.includes(p.provider_id) || /^netflix/i.test(p.provider_name || '')
  );

  // Trailer: prefere YouTube, oficial, dublado/legendado em português
  const videos = (d.videos?.results || []).filter((v) => v.site === 'YouTube');
  const trailer =
    videos.find((v) => v.type === 'Trailer' && v.iso_639_1 === 'pt') ||
    videos.find((v) => v.type === 'Trailer' && v.official) ||
    videos.find((v) => v.type === 'Trailer') ||
    videos.find((v) => v.type === 'Teaser');

  // Classificação indicativa no Brasil
  let classificacao = null;
  if (filme) {
    const datas = d.release_dates?.results?.find((r) => r.iso_3166_1 === 'BR')?.release_dates || [];
    classificacao = datas.find((x) => x.certification)?.certification || null;
  } else {
    classificacao = d.content_ratings?.results?.find((r) => r.iso_3166_1 === 'BR')?.rating || null;
  }

  const crew = d.credits?.crew || [];
  const diretores = filme
    ? crew.filter((c) => c.job === 'Director').map((c) => c.name)
    : (d.created_by || []).map((c) => c.name);

  const palavras = d.keywords?.keywords || d.keywords?.results || [];
  const data = filme ? d.release_date : d.first_air_date;

  return {
    tmdb_id: d.id,
    tipo,
    titulo: filme ? d.title : d.name,
    titulo_original: filme ? d.original_title : d.original_name,
    ano: data ? data.slice(0, 4) : null,
    data_lancamento: data || null,
    poster_path: d.poster_path || null,
    backdrop_path: d.backdrop_path || null,
    sinopse: d.overview || '',
    sinopse_original: false,
    generos: (d.genres || []).map((g) => ({ id: g.id, nome: g.name })),
    genre_ids: (d.genres || []).map((g) => g.id),
    duracao: filme ? d.runtime || null : d.episode_run_time?.[0] || null,
    temporadas: filme ? null : d.number_of_seasons ?? null,
    episodios: filme ? null : d.number_of_episodes ?? null,
    formato_serie: filme ? null : d.type || null, // ex.: "Miniseries", "Scripted"
    classificacao,
    idioma_original: d.original_language,
    paises: filme ? (d.production_countries || []).map((c) => c.iso_3166_1) : d.origin_country || [],
    nota_tmdb: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    votos: d.vote_count || 0,
    popularidade: d.popularity || 0,
    imdb_id: d.imdb_id || d.external_ids?.imdb_id || null,
    trailer_key: trailer?.key || null,
    palavras_chave: palavras.slice(0, 15).map((k) => ({ id: k.id, nome: k.name })),
    diretores,
    elenco: (d.credits?.cast || []).slice(0, 10).map((c) => ({
      nome: c.name,
      personagem: c.character,
      foto: c.profile_path,
    })),
    netflix: {
      disponivel: netflix.length > 0,
      provedores: netflix.map((p) => p.provider_name),
      verificado_em: new Date().toISOString(),
    },
  };
}

// Resultado resumido para listas de busca/autocompletar
export function resumoBusca(r) {
  const tipo = r.media_type;
  const data = tipo === 'movie' ? r.release_date : r.first_air_date;
  return {
    tmdb_id: r.id,
    tipo,
    titulo: tipo === 'movie' ? r.title : r.name,
    titulo_original: tipo === 'movie' ? r.original_title : r.original_name,
    ano: data ? data.slice(0, 4) : null,
    poster_path: r.poster_path || null,
    genre_ids: r.genre_ids || [],
    idioma_original: r.original_language || null,
    popularidade: r.popularity || 0,
  };
}
