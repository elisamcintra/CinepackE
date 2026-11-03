// Componente de SÉRIES (conteúdo do TMDB + relacionadas do Trakt). Estes testes FALHAM se:
//   - alguma série do usuário ficar de fora da base (nada de limite de 12, 60...), ou se a nota não valer mais;
//   - o Trakt deixar de ser consultado para cada série do usuário, ou deixar de somar pontos nas recomendações;
//   - algum filme receber pontos do componente (só séries);
//   - o catálogo de séries da Netflix BR não for avaliado por inteiro;
//   - o rastreamento não mostrar quanto o Trakt e o conteúdo somaram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoFalso, chamadas, instalarSimulador, relacionadasTrakt, usuarioDeTeste } from './helpers/simulador.js';

process.env.TMDB_READ_TOKEN = 'teste';
process.env.AI_PROVIDER = 'none';
process.env.OMDB_API_KEY = '';
process.env.SUPABASE_URL = '';
process.env.TRAKT_CLIENT_ID = 'teste';
instalarSimulador();
(await import('../server/services/movielensService.js')).carregarDe(null);

const { montarBaseSeries, prepararSeries, sinaisDeSeries, ESCALA_SERIES } = await import('../server/services/seriesService.js');
const { gerarPerfil } = await import('../server/services/profileService.js');
const { obterRecomendacoes } = await import('../server/services/recommendationService.js');

// Usuário com MUITAS séries (bem mais que 60): 100 que gostou, 30 que largou, 1 nota 3 (neutra)
const tabelas = usuarioDeTeste();
const gostou = Array.from({ length: 100 }, (_, i) => 8000 + i * 3); // múltiplos de 3: o "gosto" do mundo simulado
const largou = Array.from({ length: 30 }, (_, i) => 9001 + i * 3);
tabelas.watch_history_import.push(
  ...gostou.map((id, i) => ({ titulo_original: `Gostei ${id}`, titulo_tmdb: `Série ${id}`, tmdb_id: id, tipo: 'tv', episodios_vistos: 12, peso: i % 2 ? 1 : 0.7, generos: [10765] })),
  ...largou.map((id) => ({ titulo_original: `Larguei ${id}`, titulo_tmdb: `Série ${id}`, tmdb_id: id, tipo: 'tv', episodios_vistos: 1, peso: -0.3, generos: [18] })),
  { titulo_original: 'Nota três', titulo_tmdb: 'Série 9999', tmdb_id: 9999, tipo: 'tv', episodios_vistos: 20, peso: 1, generos: [18] }
);
tabelas.user_titles.push({ tmdb_id: 9999, tipo: 'tv', status: 'ja_vi', nota: 3, origem: 'app', dados: { titulo: 'Série 9999' } });
const db = bancoFalso(tabelas);

// Séries do usuário: Dark (nota 5), "Série largada" (77), a 5102 (Já vi, sem nota), as 100 + 30 + a nota três
const seriesDoUsuario = new Set([70524, 77, 5102, 9999, ...gostou, ...largou]);
const comPeso = [...seriesDoUsuario].filter((id) => id !== 9999);

const dados = { historico: tabelas.watch_history_import, titulos: tabelas.user_titles };
const base = montarBaseSeries(dados);

test('base de séries: TODAS as séries do usuário entram, sem limite, e a nota vale mais que o histórico', () => {
  assert.equal(base.total, seriesDoUsuario.size, `${base.total} de ${seriesDoUsuario.size} séries na base`);
  assert.deepEqual(new Set(base.itens.map((x) => x.tmdb_id)), seriesDoUsuario);
  assert.ok(base.total > 60, 'mais que o antigo limite de 60 amostras');
  const por = Object.fromEntries(base.itens.map((x) => [x.tmdb_id, x]));
  assert.equal(por[70524].w, 1, 'Dark: nota 5 = +1');
  assert.equal(por[9999].w, 0, 'nota 3 vence o peso 1 do histórico e fica neutra');
  assert.equal(por[77].w, -0.3, 'série largada conta contra');
  assert.equal(por[5102].w, 0.4, '"Já vi" sem nota e fora do histórico');
  assert.equal(base.negativas, 31);
  assert.ok(!base.itens.some((x) => x.tmdb_id === 9996 || x.tmdb_id === 303), 'nem linha sem nome nem filme');
});

const recs = await (async () => {
  await gerarPerfil(db, 'u-series');
  return obterRecomendacoes(db, 'u-series', {});
})();
const series = recs.itens.filter((t) => t.tipo === 'tv');
const filmes = recs.itens.filter((t) => t.tipo === 'movie');

test('ponta a ponta: o componente usa TODAS as séries do usuário e consulta o Trakt para cada uma', () => {
  assert.equal(recs.series_base.total, seriesDoUsuario.size);
  assert.ok(series.length > 0, 'há séries recomendadas');
  for (const t of series) assert.equal(t.rastreamento.series.base.series, seriesDoUsuario.size, `${t.titulo}: base incompleta`);
  const consultadas = new Set(chamadas.filter((c) => c.startsWith('api.trakt.tv/search/tmdb/')).map((c) => Number(c.match(/tmdb\/(\d+)/)[1])));
  const faltam = comPeso.filter((id) => !consultadas.has(id));
  assert.deepEqual(faltam, [], 'toda série com peso foi procurada no Trakt');
});

test('Trakt é usado de verdade: soma pontos e mostra quais séries do usuário geraram o sinal', () => {
  const comTrakt = series.filter((t) => t.rastreamento.componentes.trakt > 0);
  assert.ok(comTrakt.length > 0, 'pelo menos uma série recomendada tem pontos do Trakt');
  for (const t of comTrakt) {
    const r = t.rastreamento.series.trakt;
    assert.ok(r.ativo && r.disponivel, 'Trakt ativo');
    assert.ok(r.contribuintes.length > 0 && r.contribuintes.every((c) => seriesDoUsuario.has(c.tmdb_id)), 'quem gerou o sinal são séries do usuário');
    assert.ok(r.contribuintes.every((c) => relacionadasTrakt(c.tmdb_id).includes(t.tmdb_id)), 'a série está mesmo na lista de relacionadas do Trakt');
    assert.ok(t.rastreamento.origem.includes('trakt'));
  }
});

test('conteúdo soma pontos e o rastreamento mostra Trakt e conteúdo separados (e somando a nota)', () => {
  assert.ok(series.some((t) => t.rastreamento.componentes.conteudo_series > 0), 'conteúdo contribui');
  for (const t of series) {
    const { componentes, series: s } = t.rastreamento;
    assert.equal(componentes.conteudo_series, s.conteudo.pontos);
    assert.equal(componentes.trakt, s.trakt.pontos);
    const soma = Object.values(componentes).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(soma - t.rastreamento.total) <= 0.01);
  }
});

test('só séries: filmes nunca recebem pontos do componente', async () => {
  assert.ok(filmes.length > 0, 'a lista também tem filmes');
  for (const t of filmes) {
    assert.equal(t.rastreamento.componentes.conteudo_series, 0);
    assert.equal(t.rastreamento.componentes.trakt, 0);
    assert.equal(t.rastreamento.series.aplicavel, false);
  }
  const prep = await prepararSeries(base);
  const { sinais, descartados_nao_serie } = await sinaisDeSeries(prep, [
    { tipo: 'tv', tmdb_id: 5202 },
    { tipo: 'movie', tmdb_id: 5202 },
    { tipo: 'movie', tmdb_id: 1006 },
  ]);
  assert.equal(descartados_nao_serie, 2, 'os dois filmes foram descartados e contados');
  assert.deepEqual([...sinais.keys()], [5202]);
});

test('catálogo inteiro: todas as séries da Netflix BR são avaliadas (nenhuma amostra)', async () => {
  const prep = await prepararSeries(base);
  assert.equal(prep.catalogo.series.length, 100, 'o catálogo simulado tem 5 páginas × 20');
  assert.ok(chamadas.filter((c) => c.startsWith('api.themoviedb.org/3/discover/tv') && c.includes('with_watch_providers')).length >= 5, 'leu todas as páginas');
  // Avaliadas = o catálogo inteiro menos as séries que o usuário já tem (a 5102 está no catálogo e ele já viu)
  const jaTem = prep.catalogo.series.filter((s) => seriesDoUsuario.has(s.id)).length;
  assert.equal(jaTem, 1);
  for (const t of series) assert.equal(t.rastreamento.series.catalogo_avaliado, 100 - jaTem);
  // Todo o catálogo recebe sinal, não só uma amostra
  const { sinais } = await sinaisDeSeries(prep, prep.catalogo.series.map((s) => ({ tipo: 'tv', tmdb_id: s.id })));
  assert.equal(sinais.size, 100);
});

test('equilíbrio: com milhares de séries candidatas, os filmes continuam na lista (≥ 30% de cada tipo)', async () => {
  const { equilibrarTipos } = await import('../server/services/scoring.js');
  const lista = [...Array.from({ length: 30 }, (_, i) => ({ tipo: 'tv', id: i })), ...Array.from({ length: 10 }, (_, i) => ({ tipo: 'movie', id: 100 + i }))];
  const top = equilibrarTipos(lista, 20).slice(0, 20);
  assert.equal(top.filter((x) => x.tipo === 'movie').length, 6, '30% de 20 = 6 filmes');
  assert.deepEqual(top.filter((x) => x.tipo === 'movie').map((x) => x.id), [100, 101, 102, 103, 104, 105], 'entram os melhores filmes');
  assert.equal(top.filter((x) => x.tipo === 'tv').length, 14, 'saem as séries pior colocadas');
  assert.deepEqual(equilibrarTipos(lista.filter((x) => x.tipo === 'tv'), 20).slice(0, 20).length, 20, 'sem filmes disponíveis, nada muda');
  // Na recomendação de ponta a ponta
  const n = recs.itens.length;
  assert.ok(filmes.length >= Math.ceil(0.3 * n) && series.length >= Math.ceil(0.3 * n), `${filmes.length} filmes e ${series.length} séries em ${n}`);
});

test('sem o Trakt (variação de teste), os pontos do Trakt zeram: prova de que o componente depende dele', async () => {
  const prep = await prepararSeries(base);
  const ids = prep.catalogo.series.map((s) => ({ tipo: 'tv', tmdb_id: s.id }));
  const com = await sinaisDeSeries(prep, ids, ESCALA_SERIES);
  const sem = await sinaisDeSeries(prep, ids, { ...ESCALA_SERIES, trakt: false });
  assert.ok([...com.sinais.values()].some((s) => s.trakt.pontos > 0));
  assert.ok([...sem.sinais.values()].every((s) => s.trakt.pontos === 0));
});
