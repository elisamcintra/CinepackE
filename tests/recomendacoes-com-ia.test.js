// Teste de ponta a ponta COM IA (Gemini simulado): a IA ajuda, mas nunca inventa o que aparece
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoFalso, chamadas, idDoNome, instalarSimulador, usuarioDeTeste } from './helpers/simulador.js';

process.env.TMDB_READ_TOKEN = 'teste';
process.env.AI_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'teste';
process.env.OMDB_API_KEY = '';
process.env.SUPABASE_URL = '';
instalarSimulador();

// Sem MovieLens aqui: o teste confere que tudo funciona sem o arquivo minerado
(await import('../server/services/movielensService.js')).carregarDe(null);

const { gerarPerfil } = await import('../server/services/profileService.js');
const { obterRecomendacoes } = await import('../server/services/recommendationService.js');

const tabelas = usuarioDeTeste();
const db = bancoFalso(tabelas);
const perfil = await gerarPerfil(db, 'u1');
const recs = await obterRecomendacoes(db, 'u1', {});

test('perfil com IA: valida o que a IA devolveu', () => {
  assert.equal(perfil.gerado_por, 'ia');
  assert.match(perfil.resumo, /ficção científica/);
  assert.ok(!perfil.generos_favoritos.some((g) => g.chave === 'inventado'), 'gênero inexistente descartado');
  assert.ok(!perfil.idiomas_preferidos.includes('xx'), 'idioma inexistente descartado');
  assert.ok(!perfil.titulos_ancora.some((a) => a.tmdb_id === 99999999), 'âncora inventada descartada');
  assert.equal(perfil.generos_evitar[0].nuance, 'aceita se for europeu/realista');
});

test('sem o arquivo do MovieLens, o perfil sai sem a parte de mineração', () => {
  assert.equal(perfil.mineracao, null);
  assert.ok(recs.itens.length >= 10 && recs.itens.every((t) => !t.movielens));
});

test('temas da assinatura traduzidos para português', () => {
  const temas = perfil.assinatura_resumo.temas.map((t) => t.texto);
  assert.ok(temas.includes('distopia') && temas.includes('viagem no tempo'), temas.join(', '));
});

test('sugestões da IA: só entram as encontradas no TMDB (nome e ano batendo) e verificadas na Netflix', () => {
  assert.ok(chamadas.some((c) => c.includes('/search/multi') && c.includes('query=1899')), 'procurou "1899" no TMDB');
  const id1899 = idDoNome('1899');
  assert.ok(chamadas.some((c) => c.includes(`/tv/${id1899}?`)), 'a sugestão encontrada foi verificada (detalhes + provedores)');
  const idErrado = idDoNome('Filme Inexistente') + 2; // existe no TMDB simulado, mas de 2018 (a IA disse 1950)
  assert.ok(!chamadas.some((c) => c.includes(`/movie/${idErrado}?`)), 'ano diferente = não é o mesmo título, descartado');
  assert.ok(recs.itens.every((t) => t.netflix.disponivel));
});

test('ranking com IA: motivos da IA, ID inventado descartado, compatibilidade 0-100', () => {
  assert.ok(recs.itens.length >= 10);
  assert.ok(!recs.itens.some((t) => t.tmdb_id === 123456789), 'ID inventado pela IA não aparece');
  const daIA = recs.itens.filter((t) => t.motivo_por === 'ia');
  assert.ok(daIA.length >= 10, `${daIA.length} motivos da IA`);
  assert.ok(daIA.every((t) => /^Motivo da IA/.test(t.motivo)));
  assert.ok(recs.itens.every((t) => t.compatibilidade >= 0 && t.compatibilidade <= 100));
});

test('a chave da IA vai no header, nunca na URL', () => {
  assert.ok(chamadas.filter((c) => c.startsWith('generativelanguage')).every((c) => !c.includes('key=')));
});
