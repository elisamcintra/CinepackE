// Notas extras via OMDb: IMDb, Rotten Tomatoes e Metacritic.
// O plano grátis tem limite diário, então tudo fica em cache por 7 dias.

import { config } from '../lib/config.js';
import { getCache, setCache, DIA, HORA } from './cache.js';

export async function getRatings(imdbId) {
  if (!config.omdbApiKey || !imdbId) return null;

  const chave = `omdb:${imdbId}`;
  const hit = await getCache(chave);
  if (hit !== undefined) return hit;

  try {
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${config.omdbApiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d = await res.json();

    if (d.Response === 'False') {
      // Limite diário atingido ou chave inválida: não guarda por muito tempo
      if (/limit|invalid api key/i.test(d.Error || '')) {
        console.warn('[omdb]', d.Error);
        await setCache(chave, null, HORA, { persistir: false });
        return null;
      }
      await setCache(chave, null, 7 * DIA); // título não existe no OMDb
      return null;
    }

    const fonte = (nome) => d.Ratings?.find((r) => r.Source === nome)?.Value || null;
    const notas = {
      imdb: d.imdbRating && d.imdbRating !== 'N/A' ? { nota: d.imdbRating, votos: d.imdbVotes } : null,
      rotten_tomatoes: fonte('Rotten Tomatoes'),
      metacritic: d.Metascore && d.Metascore !== 'N/A' ? d.Metascore : null,
      imdb_url: `https://www.imdb.com/title/${imdbId}/`,
    };
    await setCache(chave, notas, 7 * DIA);
    return notas;
  } catch (e) {
    console.warn('[omdb] falhou:', e.message);
    return null;
  }
}
