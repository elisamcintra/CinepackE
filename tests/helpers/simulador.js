// Simulador de TMDB e IA (Gemini) para os testes rodarem sem internet e sem chaves.
//
// Regras do "mundo simulado":
//   - IDs PARES estão na Netflix Brasil; ímpares estão em outro streaming.
//   - IDs múltiplos de 3 têm temas "dystopia" + "time travel" e a diretora "Diretora A"
//     (é o "gosto" do usuário de teste); os demais têm "small town".
//   - A busca por nome devolve um filme e uma série com aquele nome, de 2018.
//   - Trakt: cada série tem 10 relacionadas (IDs pares 5200+), que dependem só do ID dela.

export const chamadas = [];

export function idDoNome(nome) {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 997;
  return 7000 + h * 6; // múltiplo de 6: par (Netflix) e múltiplo de 3 (gosto do usuário)
}

function detalhes(tipo, id, idioma) {
  const naNetflix = id % 2 === 0;
  const gosto = id % 3 === 0;
  let generos = gosto ? [{ id: 878, name: 'Ficção científica' }] : id % 3 === 1 ? [{ id: 18, name: 'Drama' }] : [{ id: 10749, name: 'Romance' }];
  if (tipo === 'tv') generos = [{ id: gosto ? 10765 : 18, name: 'X' }];
  const palavras = gosto
    ? [{ id: 9010, name: 'dystopia' }, { id: 9011, name: 'time travel' }]
    : [{ id: 9020, name: 'small town' }];
  return {
    id,
    title: `Filme ${id}`,
    name: `Série ${id}`,
    original_title: `Movie ${id}`,
    original_name: `Show ${id}`,
    overview: id % 5 === 0 && idioma === 'pt-BR' ? '' : `Sinopse ${id}`,
    release_date: '2019-05-01',
    first_air_date: '2020-01-01',
    genres: generos,
    runtime: 80 + (id % 70),
    number_of_seasons: (id % 4) + 1,
    original_language: id % 4 === 0 ? 'ko' : 'en',
    vote_average: 6 + (id % 30) / 10,
    vote_count: 100 + (id % 7) * 300,
    popularity: 20,
    imdb_id: `tt${id}`,
    'watch/providers': {
      results: {
        BR: {
          flatrate: naNetflix
            ? [{ provider_id: id % 4 === 0 ? 1796 : 8, provider_name: id % 4 === 0 ? 'Netflix basic with Ads' : 'Netflix' }]
            : [{ provider_id: 119, provider_name: 'Amazon Prime Video' }],
        },
      },
    },
    videos: { results: [{ site: 'YouTube', type: 'Trailer', key: `yt${id}`, official: true }] },
    release_dates: { results: [{ iso_3166_1: 'BR', release_dates: [{ certification: '14' }] }] },
    content_ratings: { results: [{ iso_3166_1: 'BR', rating: '16' }] },
    keywords: { keywords: palavras, results: palavras },
    credits: { cast: [{ name: gosto ? 'Atriz X' : 'Ator Y', character: 'P' }], crew: [{ job: 'Director', name: gosto ? 'Diretora A' : 'Diretor B' }] },
    created_by: [{ id: gosto ? 601 : 602, name: gosto ? 'Diretora A' : 'Diretor B' }],
    aggregate_credits: { cast: [{ id: gosto ? 501 : 502, name: gosto ? 'Atriz X' : 'Ator Y', total_episode_count: 10 }] },
    networks: [{ id: 213 }],
    origin_country: ['US'],
    type: 'Scripted',
    number_of_episodes: 10,
    episode_run_time: [45],
  };
}

function respostaTmdb(u) {
  const p = u.pathname.replace('/3', '');
  const q = u.searchParams.get('query');
  if (p === '/search/keyword') return { results: [{ id: 9000 + q.length, name: q }] };
  if (p === '/search/multi') {
    const id = idDoNome(q);
    return {
      results: [
        { id, media_type: 'tv', name: q, original_name: q, popularity: 50, genre_ids: [10765], original_language: 'de', first_air_date: '2018-03-01' },
        { id: id + 2, media_type: 'movie', title: q, original_title: q, popularity: 40, genre_ids: [878], original_language: 'en', release_date: '2018-06-01' },
      ],
    };
  }
  let m = p.match(/^\/discover\/(movie|tv)$/);
  if (m) {
    const page = Number(u.searchParams.get('page'));
    const base = m[1] === 'movie' ? 1000 : 5000;
    return {
      total_pages: 5,
      results: Array.from({ length: 20 }, (_, i) => {
        const id = base + page * 100 + i;
        const gosto = id % 3 === 0;
        return {
          id,
          name: `Série ${id}`,
          original_name: `Show ${id}`,
          title: `Filme ${id}`,
          overview: `Sinopse ${id}`,
          genre_ids: m[1] === 'tv' ? [gosto ? 10765 : 18] : [gosto ? 878 : 18],
          original_language: id % 4 === 0 ? 'ko' : 'en',
          origin_country: ['US'],
          first_air_date: '2020-01-01',
          vote_average: 6 + (id % 30) / 10,
          vote_count: 100 + (id % 7) * 300,
          popularity: 20,
        };
      }),
    };
  }
  m = p.match(/^\/(movie|tv)\/(\d+)\/recommendations$/);
  if (m) return { results: Array.from({ length: 12 }, (_, i) => ({ id: 3000 + (Number(m[2]) % 50) * 2 + i })) };
  m = p.match(/^\/(movie|tv)\/(\d+)\/reviews$/);
  if (m) return { results: [] };
  m = p.match(/^\/(movie|tv)\/(\d+)$/);
  if (m) return detalhes(m[1], Number(m[2]), u.searchParams.get('language'));
  return null;
}

// Trakt simulado: busca pelo ID do TMDB e séries relacionadas
export const relacionadasTrakt = (tmdbId) => Array.from({ length: 10 }, (_, i) => 5200 + (tmdbId % 10) * 2 + i * 2);
function respostaTrakt(u) {
  let m = u.pathname.match(/^\/search\/tmdb\/(\d+)$/);
  if (m) return [{ type: 'show', show: { title: `Série ${m[1]}`, ids: { trakt: Number(m[1]) + 100000, tmdb: Number(m[1]) } } }];
  m = u.pathname.match(/^\/shows\/(\d+)\/related$/);
  if (m) return relacionadasTrakt(Number(m[1]) - 100000).map((id) => ({ title: `Série ${id}`, year: 2020, ids: { trakt: id + 100000, tmdb: id } }));
  return null;
}

// Respostas da IA simulada, conforme o tipo de pedido
function respostaIA(prompt) {
  if (prompt.includes('Traduza para o português')) {
    return { traducoes: { dystopia: 'distopia', 'time travel': 'viagem no tempo', 'small town': 'cidade pequena' } };
  }
  if (prompt.includes('Monte o perfil de gosto')) {
    return {
      resumo: 'Você curte ficção científica cerebral e distopias, com finais que fazem pensar.',
      generos_favoritos: [{ chave: 'scifi', peso: 0.95 }, { chave: 'misterio', peso: 0.6 }, { chave: 'inventado', peso: 1 }],
      generos_evitar: [{ chave: 'romance', nuance: 'aceita se for europeu/realista', forca: 0.6 }],
      palavras_chave_tmdb: ['dystopia', 'time travel'],
      idiomas_preferidos: ['de', 'xx'],
      tom: ['cerebral'],
      evitar: ['susto barato'],
      titulos_ancora: ['tv:70524', 'movie:99999999'],
      duracao_preferida: 'qualquer',
    };
  }
  if (prompt.includes('Sugira')) {
    return {
      sugestoes: [
        { titulo_original: '1899', titulo: '1899', ano: 2018, tipo: 'tv', por_que: 'Dos criadores de Dark.' },
        { titulo_original: 'Black Mirror', titulo: 'Black Mirror', ano: 2018, tipo: 'tv', por_que: 'Distopia próxima.' },
        { titulo_original: 'Filme Inexistente', titulo: 'Filme Inexistente', ano: 1950, tipo: 'movie', por_que: 'x' },
      ],
    };
  }
  if (prompt.includes('Escolha os')) {
    const ids = [...new Set([...prompt.matchAll(/"id": "((?:movie|tv):\d+)"/g)].map((m) => m[1]))];
    return {
      itens: [
        { id: 'movie:123456789', compatibilidade: 99, motivo: 'inventado pela IA' },
        ...ids.slice(0, 15).map((id, i) => ({ id, compatibilidade: 95 - i * 3, motivo: `Motivo da IA para ${id}.` })),
      ],
    };
  }
  return {};
}

export function instalarSimulador() {
  globalThis.fetch = async (url, opcoes = {}) => {
    const u = new URL(String(url));
    chamadas.push(u.hostname + u.pathname + u.search);
    const ok = (d) => ({ ok: true, status: 200, json: async () => d });

    if (u.hostname === 'generativelanguage.googleapis.com') {
      const corpo = JSON.parse(opcoes.body);
      const texto = JSON.stringify(respostaIA(corpo.contents[0].parts[0].text));
      return ok({ candidates: [{ content: { parts: [{ text: '```json\n' + texto + '\n```' }] } }] });
    }
    if (u.hostname === 'api.trakt.tv') {
      const d = respostaTrakt(u);
      return d ? { ...ok(d), headers: new Headers() } : { ok: false, status: 404, headers: new Headers(), json: async () => null };
    }
    if (u.hostname === 'api.themoviedb.org') {
      const d = respostaTmdb(u);
      return d ? ok(d) : { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

// Banco falso que imita a API encadeada do supabase-js
export function bancoFalso(tabelas) {
  return {
    from(t) {
      const q = {
        select: () => q, order: () => q, limit: () => q, eq: () => q, neq: () => q, gt: () => q, or: () => q, update: () => q,
        in: () => q, is: () => q, not: () => q,
        maybeSingle: async () => ({ data: (tabelas[t] || [])[0] || null, error: null }),
        upsert: async (v) => {
          if (t === 'taste_profiles') tabelas.taste_profiles = [{ ...v }];
          if (t === 'recommendation_cache') tabelas.recommendation_cache = [{ ...v }];
          return { error: null };
        },
        delete: () => {
          if (t === 'recommendation_cache') tabelas.recommendation_cache = [];
          return q;
        },
        then: (res, rej) => Promise.resolve({ data: tabelas[t] || [], error: null, count: 0 }).then(res, rej),
      };
      return q;
    },
  };
}

// Dados de um usuário de teste: ama Dark (ficção científica), rejeitou um drama
export function usuarioDeTeste() {
  return {
    quiz_answers: [
      { question_id: 1, option_ids: ['cliche_mas_europeu'], comentario: 'Gosto de romance francês' },
      { question_id: 2, option_ids: ['suspense_psicologico'] },
      { question_id: 8, option_ids: ['scifi_cerebral', 'toque_estranho'] },
      { question_id: 9, option_ids: ['series_longas'] },
      { question_id: 10, option_ids: ['tv:70524'], comentario: 'Amo a trama de Dark' },
    ],
    watch_history_import: [
      { titulo_original: 'Dark', titulo_tmdb: 'Dark', tmdb_id: 70524, tipo: 'tv', episodios_vistos: 26, peso: 1, generos: [10765, 9648], idioma_original: 'de', ano: '2017' },
      { titulo_original: 'Distopia 3', tmdb_id: 303, tipo: 'movie', vezes: 2, peso: 1, generos: [878], idioma_original: 'en', ano: '2015' },
      // Linha sem nome (como a Netflix exporta títulos que saíram do catálogo): nunca pode contar
      { titulo_original: ' : Episódio 3', titulo_tmdb: 'Filme Errado', tmdb_id: 9996, tipo: 'movie', vezes: 5, peso: 1, generos: [16], idioma_original: 'ja', ano: '2010' },
      { titulo_original: 'Série largada', tmdb_id: 77, tipo: 'tv', episodios_vistos: 1, peso: -0.3, generos: [35], idioma_original: 'en', ano: '2020' },
    ],
    user_titles: [
      { tmdb_id: 70524, tipo: 'tv', status: 'ja_vi', nota: 5, origem: 'avaliacao_rapida', dados: { titulo: 'Dark', genre_ids: [10765, 9648] } },
      { tmdb_id: 606, tipo: 'movie', status: 'ja_vi', nota: 5, origem: 'app', dados: { titulo: 'Filme 606', genre_ids: [878] } },
      { tmdb_id: 1100, tipo: 'movie', status: 'nao_interessa', motivo: 'Parece lento', dados: { titulo: 'Filme 1100', genre_ids: [18] } },
      { tmdb_id: 202, tipo: 'movie', status: 'ja_vi', nota: 1, origem: 'app', dados: { titulo: 'Filme 202', genre_ids: [18] } },
      { tmdb_id: 5102, tipo: 'tv', status: 'ja_vi', nota: null, origem: 'historico', dados: {} },
    ],
  };
}
