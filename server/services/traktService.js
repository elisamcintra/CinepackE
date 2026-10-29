// Trakt (https://trakt.tv): séries RELACIONADAS a uma série, pela API pública (só o Client ID, sem login).
//
// Regras da política de uso (https://developer.trakt.tv/docs/api-use-policy):
//   - só o que o app precisa: as relacionadas das séries de cada pessoa, pedidas na hora em que são usadas;
//   - nada de baixar ou espelhar o catálogo do Trakt;
//   - cache é permitido e incentivado (sem prazo máximo fixo): guardamos cada lista por 30 dias;
//   - atribuição obrigatória no app: "CineMatch uses Trakt but is not endorsed or certified by Trakt"
//     (rodapé, AttributionFooter.jsx).
//
// Ligação sem adivinhar: a série é procurada no Trakt pelo ID do TMDB e só vale se o Trakt devolver
// exatamente esse ID. As relacionadas só entram se tiverem ID do TMDB (as outras são contadas e descartadas).

import { config } from '../lib/config.js';
import { createLimiter, mapLimit, sleep } from '../lib/limit.js';
import { cached, DIA } from './cache.js';

const BASE = 'https://api.trakt.tv';
const PRAZO_CACHE = 30 * DIA;
// Até 100 relacionadas numa chamada só (o Trakt devolve 10 por padrão; na prática as listas têm até ~40)
const LIMITE_RELACIONADAS = 100;
// Poucas chamadas ao mesmo tempo: a API é compartilhada por muitos apps
const limitar = createLimiter(3);

export const traktDisponivel = () => !!config.traktClientId;

async function traktFetch(caminho) {
  return limitar(async () => {
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const res = await fetch(BASE + caminho, {
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': config.traktClientId,
          'User-Agent': 'CineMatch/1.0',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) {
        // Limite de chamadas: espera o tempo que o Trakt pedir
        await sleep((Number(res.headers.get('retry-after')) || 2 * (tentativa + 1)) * 1000);
        continue;
      }
      if (res.status === 404) return null;
      if (res.status === 401 || res.status === 403) throw new Error(`Trakt recusou o Client ID (${res.status}). Confira o TRAKT_CLIENT_ID.`);
      if (!res.ok) throw new Error(`O Trakt respondeu com erro (${res.status}).`);
      return res.json();
    }
    throw new Error('O Trakt está limitando as requisições. Tente de novo em instantes.');
  });
}

// ID do Trakt de uma série, a partir do ID do TMDB (só aceita o ID idêntico)
export function idTraktDaSerie(tmdbId) {
  return cached(`trakt:id:tv:${tmdbId}`, 90 * DIA, async () => {
    const lista = await traktFetch(`/search/tmdb/${tmdbId}?type=show`);
    const achado = (lista || []).find((r) => r.type === 'show' && r.show?.ids?.tmdb === Number(tmdbId));
    // null também é guardado: "o Trakt não tem esta série" não precisa ser perguntado de novo todo dia
    return achado ? achado.show.ids.trakt : null;
  });
}

/**
 * Séries relacionadas a uma série (pelo ID do TMDB).
 * Devolve { tmdb_id, trakt_id, total, itens: [{ tmdb_id, titulo, ano }], sem_tmdb } ou null se o Trakt não tiver a série.
 */
export async function relacionadas(tmdbId) {
  if (!traktDisponivel()) return null;
  const traktId = await idTraktDaSerie(tmdbId);
  if (!traktId) return null;
  return cached(`trakt:related:tv:${tmdbId}`, PRAZO_CACHE, async () => {
    const lista = (await traktFetch(`/shows/${traktId}/related?limit=${LIMITE_RELACIONADAS}`)) || [];
    const itens = [];
    const vistos = new Set();
    let semTmdb = 0;
    for (const s of lista) {
      const id = s?.ids?.tmdb;
      if (!id) {
        semTmdb++;
        continue;
      }
      if (id === Number(tmdbId) || vistos.has(id)) continue;
      vistos.add(id);
      itens.push({ tmdb_id: id, titulo: s.title || '', ano: s.year || null });
    }
    return { tmdb_id: Number(tmdbId), trakt_id: traktId, total: lista.length, itens, sem_tmdb: semTmdb };
  });
}

/**
 * Relacionadas de várias séries de uma pessoa (ex.: todas as de peso alto).
 * series: [{ tmdb_id, titulo? }]  ->  Map(tmdb_id -> resultado de relacionadas() ou null)
 * Uma série que falhar não derruba as outras.
 */
export async function relacionadasDasSeries(series) {
  const ids = [...new Set(series.map((s) => Number(s.tmdb_id)).filter(Boolean))];
  const resultados = await mapLimit(ids, 3, (id) => relacionadas(id));
  return new Map(ids.map((id, i) => [id, resultados[i]]));
}
