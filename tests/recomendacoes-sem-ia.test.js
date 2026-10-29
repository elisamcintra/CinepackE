// Teste de ponta a ponta das recomendações SEM IA (TMDB simulado, banco falso)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoFalso, chamadas, instalarSimulador, usuarioDeTeste } from './helpers/simulador.js';

process.env.TMDB_READ_TOKEN = 'teste';
process.env.AI_PROVIDER = 'none';
process.env.OMDB_API_KEY = '';
process.env.SUPABASE_URL = '';
instalarSimulador();

// MovieLens falso: quem amou o "Filme 606" (favorito do usuário de teste) também amou o 3036.
// O 3036 não vem de nenhuma recomendação do TMDB simulado: só chega pela mineração.
const movielens = await import('../server/services/movielensService.js');
movielens.carregarDe({
  estatisticas: { pessoas: 1000 },
  fonte: { base: 'teste' },
  clusters: [{ id: 7, nome: 'Ficção científica', generos: ['Ficção científica'], tamanho: 2, exemplos: [{ tmdb: 606, titulo: 'Filme 606' }] }],
  filmes: {
    606: { t: 'Filme 606', a: 2015, c: 7, n: 400, v: [[3036, 0.42, 0.62, 4.1]] },
    3036: { t: 'Filme ML', a: 2016, c: 7, n: 500, v: [[606, 0.42, 0.5, 4.1]] },
  },
});

const { gerarPerfil } = await import('../server/services/profileService.js');
const { obterRecomendacoes } = await import('../server/services/recommendationService.js');
const { buscar, interpretarPorRegras } = await import('../server/services/searchService.js');

const tabelas = usuarioDeTeste();
const db = bancoFalso(tabelas);
const perfil = await gerarPerfil(db, 'u1');
const recs = await obterRecomendacoes(db, 'u1', {});

test('perfil por regras: fonte, favoritos, âncoras e assinatura', () => {
  assert.equal(perfil.fonte, 'combinado');
  assert.equal(perfil.gerado_por, 'regras');
  assert.ok(perfil.generos_favoritos.some((g) => g.chave === 'scifi'));
  assert.ok(perfil.titulos_ancora.some((a) => a.tmdb_id === 70524));
  assert.ok(perfil.palavras_chave.every((k) => k.id));
  assert.ok(perfil.assinatura.vetor['kw:9010'] > 0, 'tema "dystopia" dos favoritos é positivo');
  assert.ok(perfil.assinatura.vetor['kw:9020'] < 0, 'tema "small town" dos rejeitados é negativo');
  assert.ok(perfil.sementes.length >= 2);
  assert.ok(!perfil.sementes.some((x) => x.tmdb_id === 9996), 'linha sem nome do histórico nunca vira favorito');
});

test('catálogo: no mínimo 10, todos verificados na Netflix BR', () => {
  assert.ok(recs.itens.length >= 10, `${recs.itens.length} itens`);
  assert.ok(recs.itens.every((t) => t.netflix.disponivel && t.tmdb_id % 2 === 0), 'só IDs pares (os que estão na Netflix no simulado)');
});

test('catálogo: nunca recomenda Já vi nem Não me interessa', () => {
  const proibidos = new Set(['movie:1100', 'tv:5102', 'tv:70524', 'movie:606', 'movie:202']);
  assert.ok(!recs.itens.some((t) => proibidos.has(`${t.tipo}:${t.tmdb_id}`)));
});

test('catálogo: todo item tem motivo e % de compatibilidade', () => {
  assert.ok(recs.itens.every((t) => t.motivo && t.compatibilidade >= 35 && t.compatibilidade <= 98));
});

test('catálogo: títulos com o "DNA" do usuário ficam no topo', () => {
  const topo = recs.itens.slice(0, 5);
  const comGosto = topo.filter((t) => t.tmdb_id % 3 === 0).length;
  assert.ok(comGosto >= 4, `${comGosto} de 5 no topo têm os temas favoritos`);
  assert.ok(topo.some((t) => t.temas_em_comum?.length), 'mostra temas em comum');
});

test('mineração (MovieLens): base com 1 filme (abaixo de 20) tem peso reduzido e aviso', () => {
  assert.equal(recs.movielens_base.disponiveis, 1, 'o "Filme 606" é o único filme do usuário que a base conhece');
  assert.equal(recs.movielens_base.alfa, 0.05);
  assert.match(recs.movielens_base.aviso, /1 de 20/);
  const filmes = recs.itens.filter((x) => x.tipo === 'movie');
  for (const t of filmes) assert.ok(t.rastreamento.componentes.movielens <= 0.15, 'com α = 0,05, no máximo 3 × 0,05 pontos');
});

test('mineração (MovieLens): perfil traz regras e famílias de gosto', () => {
  const r = perfil.mineracao.regras[0];
  assert.equal(r.de.tmdb_id, 606);
  assert.equal(r.para.tmdb_id, 3036);
  assert.ok(r.para.titulo, 'título vindo do TMDB');
  assert.equal(r.lift, 4.1);
  assert.equal(perfil.mineracao.familias[0].nome, 'Ficção científica');
});

test('sinopse vazia em português cai para a original', () => {
  assert.ok(recs.itens.some((t) => t.sinopse_original) || recs.itens.every((t) => t.sinopse));
});

test('humor do dia mantém ao menos 10', async () => {
  const r = await obterRecomendacoes(db, 'u1', { tempo: 'ate_1h30', clima: 'pensar' });
  assert.ok(r.itens.length >= 10);
});

test('pesquisa: filtros chegam ao TMDB e resultados são verificados', async () => {
  const r = await buscar(db, 'u1', { filtros: { tipo: 'movie', generos: ['scifi'], duracaoMax: 120, classificacaoMax: '14', ordenar: 'nota' }, texto: '' });
  assert.ok(r.itens.length > 0 && r.itens.every((t) => t.tipo === 'movie' && t.netflix.disponivel));
  const notas = r.itens.map((t) => t.nota_tmdb);
  assert.ok(notas.every((n, i) => i === 0 || notas[i - 1] >= n), 'ordenado por nota');
  const url = chamadas.filter((c) => c.includes('/discover/movie')).at(-1);
  assert.match(url, /with_genres=878/);
  assert.match(url, /with_runtime.lte=120/);
  assert.match(url, /certification.lte=14/);
  assert.match(url, /with_watch_providers=8%7C1796/);
});

test('pesquisa: minisséries respeitadas', async () => {
  const r = await buscar(db, 'u1', { filtros: { tipo: 'tv', temporadas: 'mini' }, texto: 'algo tipo Dark, mas menos confuso' });
  assert.ok(r.itens.every((t) => t.tipo === 'tv' && (t.temporadas ?? 1) <= 1));
});

test('texto livre sem IA: entende pedidos comuns', () => {
  const i = interpretarPorRegras('comédia leve para ver com minha mãe');
  assert.ok(i.generos.includes('comedia') && i.excluir_generos.includes('terror') && i.clima === 'leve');
  assert.equal(interpretarPorRegras('algo tipo Dark, mas menos confuso').titulos_referencia[0], 'Dark');
});
