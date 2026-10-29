// Trakt: séries relacionadas (traktService.js), com um Trakt falso (nenhuma chamada de verdade).
// Garantias:
//   - a série só é ligada ao Trakt se ele devolver EXATAMENTE o mesmo ID do TMDB (nada de adivinhar);
//   - relacionadas sem ID do TMDB são descartadas e contadas; a própria série e repetidas não entram;
//   - o cache evita perguntar de novo; sem TRAKT_CLIENT_ID, nada é chamado.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TRAKT_CLIENT_ID = 'teste';
process.env.SUPABASE_URL = '';

const chamadas = [];
globalThis.fetch = async (url, opcoes) => {
  const u = new URL(url);
  chamadas.push(u.pathname + u.search);
  assert.equal(opcoes.headers['trakt-api-key'], 'teste');
  assert.equal(opcoes.headers['trakt-api-version'], '2');
  const json = (dados) => ({ ok: true, status: 200, headers: new Headers(), json: async () => dados });
  if (u.pathname === '/search/tmdb/100') return json([{ type: 'show', show: { title: 'Série A', ids: { trakt: 1, tmdb: 100 } } }]);
  // O Trakt devolve outra série (ID diferente): não pode ser aceita
  if (u.pathname === '/search/tmdb/200') return json([{ type: 'show', show: { title: 'Outra', ids: { trakt: 2, tmdb: 999 } } }]);
  if (u.pathname === '/search/tmdb/300') return json([]);
  if (u.pathname === '/shows/1/related')
    return json([
      { title: 'B', year: 2020, ids: { trakt: 10, tmdb: 101 } },
      { title: 'Sem TMDB', year: 2021, ids: { trakt: 11, tmdb: null } },
      { title: 'A de novo', year: 2019, ids: { trakt: 1, tmdb: 100 } },
      { title: 'B repetida', year: 2020, ids: { trakt: 10, tmdb: 101 } },
      { title: 'C', year: 2018, ids: { trakt: 12, tmdb: 102 } },
    ]);
  return { ok: false, status: 404, headers: new Headers(), json: async () => null };
};

const trakt = await import('../server/services/traktService.js');

test('relacionadas: só itens com ID do TMDB, sem a própria série e sem repetidas', async () => {
  const r = await trakt.relacionadas(100);
  assert.equal(r.trakt_id, 1);
  assert.equal(r.total, 5);
  assert.equal(r.sem_tmdb, 1);
  assert.deepEqual(r.itens.map((x) => x.tmdb_id), [101, 102]);
  assert.ok(chamadas.some((c) => c === '/shows/1/related?limit=100'), 'pede a lista inteira numa chamada');
});

test('ligação sem adivinhar: ID diferente ou série ausente no Trakt = null', async () => {
  assert.equal(await trakt.relacionadas(200), null, 'o Trakt devolveu outro ID do TMDB');
  assert.equal(await trakt.relacionadas(300), null, 'o Trakt não tem a série');
  assert.ok(!chamadas.some((c) => c.startsWith('/shows/2/')), 'não pede relacionadas de uma série que não bateu');
});

test('cache: a segunda vez não chama o Trakt; relacionadasDasSeries junta várias séries', async () => {
  const antes = chamadas.length;
  const mapa = await trakt.relacionadasDasSeries([{ tmdb_id: 100 }, { tmdb_id: 200 }, { tmdb_id: 100 }]);
  assert.equal(chamadas.length, antes, 'tudo veio do cache');
  assert.equal(mapa.size, 2);
  assert.deepEqual(mapa.get(100).itens.map((x) => x.tmdb_id), [101, 102]);
  assert.equal(mapa.get(200), null);
});
