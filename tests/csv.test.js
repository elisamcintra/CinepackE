// Testes da leitura do histórico da Netflix (CSV)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparHistorico, analisarTitulo, detectarFormatoData, lerData, parseNetflixCsvText } from '../src/modules/cinematch/lib/parseNetflixCsv.js';

const CSV = `﻿Title,Date
"Dark: Temporada 1: ""Segredos""",19/10/2025
"Dark: Temporada 1: ""Mentiras""",20/10/2025
"Dark: Temporada 2: ""Começos e fins""",02/11/2025
"Stranger Things: Season 2: Chapter One",03/01/2025
"Stranger Things: Season 2: Chapter Two",04/01/2025
"Roma",05/03/2024
"Roma",15/08/2025
"Star Wars: Episódio IV - Uma Nova Esperança",01/02/2024
"Olhos que Condenam: Minissérie: Parte 1",10/10/2024
"Olhos que Condenam: Minissérie: Parte 2",11/10/2024
"Love, Death & Robots: Três Robôs",01/01/2025
"Love, Death & Robots: A Vantagem de Sonnie",01/01/2025
"Love, Death & Robots: A Testemunha",01/01/2025
"Love, Death & Robots: Mecanizados",01/01/2025
"Round 6: Temporada 1: Batatinha frita 1, 2, 3",13/12/2025
`;

test('lê o CSV, agrupa episódios e remove duplicados', () => {
  const r = parseNetflixCsvText(CSV);
  const porNome = Object.fromEntries(r.itens.map((i) => [i.titulo, i]));
  assert.equal(r.totalLinhas, 15);
  assert.equal(r.formatoData, 'dmy');
  assert.equal(porNome['Dark'].tipoProvavel, 'tv');
  assert.equal(porNome['Dark'].episodios, 3);
  assert.equal(porNome['Dark'].temporadas, 2);
  assert.equal(porNome['Roma'].tipoProvavel, 'movie');
  assert.equal(porNome['Roma'].vezes, 2);
  assert.equal(porNome['Love, Death & Robots'].tipoProvavel, 'tv', 'série sem a palavra "Temporada" (prefixo repetido)');
  assert.ok(porNome['Star Wars: Episódio IV - Uma Nova Esperança'], 'filme com ":" e "Episódio" continua filme');
  assert.equal(porNome['Star Wars: Episódio IV - Uma Nova Esperança'].tipoProvavel, 'movie');
});

test('peso de gosto: muitos episódios = forte; largou cedo = negativo; filme revisto = forte', () => {
  const r = parseNetflixCsvText(CSV);
  const peso = (n) => r.itens.find((i) => i.titulo === n).peso;
  assert.equal(peso('Dark'), 1);
  assert.equal(peso('Roma'), 1);
  assert.ok(peso('Round 6') < 0);
  assert.ok(peso('Stranger Things') < 0);
});

test('datas: detecta dd/mm, mm/dd e ISO; datas inválidas viram null', () => {
  assert.equal(detectarFormatoData(['19/10/2025', '01/02/2025']), 'dmy');
  assert.equal(detectarFormatoData(['10/19/26', '1/2/26']), 'mdy');
  assert.equal(detectarFormatoData(['2026-10-19']), 'ymd');
  assert.equal(lerData('10/19/26', 'mdy'), '2026-10-19');
  assert.equal(lerData('19/10/2026', 'dmy'), '2026-10-19');
  assert.equal(lerData('31/02/2025', 'dmy'), null);
  assert.equal(lerData('abc', 'dmy'), null);
});

test('analisarTitulo reconhece marcadores em português e inglês', () => {
  assert.deepEqual(analisarTitulo('Dark: Temporada 1: "Segredos"').base, 'Dark');
  assert.deepEqual(analisarTitulo('La Casa de Papel: Parte 3: Episódio 1').base, 'La Casa de Papel');
  assert.deepEqual(analisarTitulo('The Crown: Season 4: Gold Stick').base, 'The Crown');
  assert.equal(analisarTitulo('Roma').serie, false);
});

test('arquivo sem títulos dá erro amigável', () => {
  assert.throws(() => parseNetflixCsvText('Title,Date\n'), /Não encontramos títulos|vazio/);
  assert.equal(agruparHistorico([]).length, 0);
});

test('linhas sem nome (" : Episódio 3") são ignoradas, não viram filmes falsos', async () => {
  const { semNome, parseNetflixCsvText } = await import('../src/modules/cinematch/lib/parseNetflixCsv.js');
  for (const t of [' : Episódio 11', ': Episódio 3', 'Episódio 3', 'Temporada 1: Episódio 2', '  ', '—']) assert.ok(semNome(t), t);
  for (const t of ['Dark: Temporada 1: Segredos', 'Roma', 'Star Wars: Episódio IV', 'Episódio Final do Mundo']) assert.ok(!semNome(t), t);
  const csv = ['Title,Date', '" : Episódio 1","12/21/24"', '" : Episódio 1","12/22/24"', '" : Episódio 2","12/22/24"', '"Roma","12/23/24"'].join('\n');
  const r = parseNetflixCsvText(csv);
  assert.equal(r.linhasSemNome, 3);
  assert.deepEqual(r.itens.map((i) => i.titulo), ['Roma']);
});

test('associação com o TMDB: só nome idêntico, sem adivinhar', async () => {
  process.env.SUPABASE_URL ??= '';
  const { escolherExato } = await import('../server/routes/import.js');
  const r = (id, media_type, nome, data, extra = {}) =>
    media_type === 'movie'
      ? { id, media_type, title: nome, original_title: nome, release_date: data, ...extra }
      : { id, media_type, name: nome, original_name: nome, first_air_date: data, ...extra };

  // Linha sem nome: nada, nem procura
  assert.deepEqual(escolherExato([r(1, 'movie', 'One Piece: Episódio da Nami', '2012-08-25')], { titulo: ' : Episódio 11' }), {});
  // Nome parecido não basta
  assert.deepEqual(escolherExato([r(1, 'movie', 'One Piece: Episódio da Nami', '2012-08-25')], { titulo: 'Episódio da Nami' }), {});
  assert.deepEqual(escolherExato([r(2, 'tv', 'Darkness', '2020-01-01')], { titulo: 'Dark' }), {});
  // Nome idêntico (sem contar acentos e pontuação), em português ou no original
  assert.equal(escolherExato([r(3, 'tv', 'Dark', '2017-12-01')], { titulo: 'Dark' }).match.tmdb_id, 3);
  assert.equal(escolherExato([{ ...r(4, 'tv', 'Os 100', '2014-03-19'), original_name: 'The 100' }], { titulo: 'The 100' }).match.tmdb_id, 4);

  // Homônimos: não escolhe, devolve as opções
  const romas = [r(10, 'movie', 'Roma', '2018-08-30'), r(11, 'movie', 'Roma', '1972-03-16')];
  const amb = escolherExato(romas, { titulo: 'Roma', tipoProvavel: 'movie', vistoEm: '2024-05-03' });
  assert.equal(amb.match, undefined);
  assert.deepEqual(amb.opcoes.map((o) => o.tmdb_id), [10, 11]);
  // ...a menos que um fato separe: ano no nome, data em que assistiu, país no nome, tipo do histórico
  assert.equal(escolherExato(romas, { titulo: 'Roma (1972)' }).match.tmdb_id, 11);
  assert.equal(escolherExato(romas, { titulo: 'Roma', vistoEm: '2010-01-01' }).match.tmdb_id, 11, 'o de 2018 ainda não existia');
  const offices = [r(20, 'tv', 'The Office', '2005-03-24', { origin_country: ['US'] }), r(21, 'tv', 'The Office', '2001-07-09', { origin_country: ['GB'] })];
  assert.equal(escolherExato(offices, { titulo: 'The Office (U.S.)' }).match.tmdb_id, 20);
  assert.equal(escolherExato([r(30, 'tv', 'Dark', '2017-12-01'), r(31, 'movie', 'Dark', '2015-01-01')], { titulo: 'Dark', tipoProvavel: 'tv' }).match.tmdb_id, 30);
});
