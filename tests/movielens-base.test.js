// Garantias do MovieLens no app (regras aprovadas na Fase 1). Estes testes FALHAM se:
//   - algum filme da pessoa que a base conhece ficar de fora do cálculo (nada de limite de favoritos);
//   - o peso de algum título não seguir a fórmula (sinal × recência);
//   - com menos de 20 títulos, o peso não for reduzido e o aviso não aparecer;
//   - o MovieLens voltar a ter contribuição ZERO nas recomendações;
//   - o rastreamento não somar exatamente a pontuação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoFalso, instalarSimulador } from './helpers/simulador.js';

process.env.TMDB_READ_TOKEN = 'teste';
process.env.AI_PROVIDER = 'none';
process.env.OMDB_API_KEY = '';
process.env.SUPABASE_URL = '';
instalarSimulador();

const movielens = await import('../server/services/movielensService.js');
const { montarBase, recencia, MINIMO_BASE } = await import('../server/services/movielensBase.js');

// MovieLens falso: os filmes 2001..2030 da pessoa; cada um tem como vizinhos os candidatos 4000 + 2k
// (pares = estão na Netflix no simulador). O 2030 só se liga ao 4100 (pra testar o sinal negativo).
const FILMES = Array.from({ length: 30 }, (_, i) => 2001 + i);
const filmesMl = {};
for (const id of FILMES) {
  filmesMl[id] = {
    t: `Filme ML ${id}`, a: 2010, c: 1, n: 1000,
    v: id === 2030 ? [[4100, 0.5, 0.4, 3]] : [[4000 + ((id % 10) + 1) * 2, 0.3, 0.4, 2.5], [4100, 0.1, 0.2, 1.6], [4200 + (id % 3) * 2, 0.2, 0.3, 2]],
  };
}
for (let c = 4000; c <= 4300; c += 2) filmesMl[c] ||= { t: `Candidato ${c}`, a: 2015, c: 1, n: 800, v: [] };
movielens.carregarDe({ estatisticas: { pessoas: 1000 }, fonte: { base: 'teste' }, clusters: [{ id: 1, nome: 'Teste', generos: [], tamanho: 1, exemplos: [] }], filmes: filmesMl });

const AGORA = new Date('2026-10-27T12:00:00Z');
const diasAtras = (d) => new Date(AGORA.getTime() - d * 86400000).toISOString();

test('peso = sinal × recência, com cada fonte (nota, "Não me interessa", histórico) e a data', () => {
  assert.equal(recencia(AGORA.toISOString(), AGORA), 1);
  assert.equal(recencia(diasAtras(730), AGORA), 0.75);
  assert.equal(recencia(diasAtras(1460), AGORA), 0.625);
  assert.equal(recencia(null, AGORA), 0.5);

  const base = montarBase(
    {
      historico: [
        { titulo_original: 'Visto uma vez', titulo_tmdb: 'A', tmdb_id: 2001, tipo: 'movie', vezes: 1, ultima_data: diasAtras(0) },
        { titulo_original: 'Visto duas', titulo_tmdb: 'B', tmdb_id: 2002, tipo: 'movie', vezes: 3, ultima_data: diasAtras(730) },
        { titulo_original: 'Com nota', titulo_tmdb: 'C', tmdb_id: 2003, tipo: 'movie', vezes: 1, ultima_data: diasAtras(100) },
        { titulo_original: ' : Episódio 3', titulo_tmdb: 'Falso', tmdb_id: 2004, tipo: 'movie', vezes: 5, ultima_data: diasAtras(0) },
        { titulo_original: 'Série', titulo_tmdb: 'S', tmdb_id: 2005, tipo: 'tv', vezes: 1, ultima_data: diasAtras(0) },
        { titulo_original: 'Fora da base', titulo_tmdb: 'X', tmdb_id: 999999, tipo: 'movie', vezes: 1, ultima_data: diasAtras(0) },
      ],
      titulos: [
        { tmdb_id: 2003, tipo: 'movie', status: 'ja_vi', nota: 1, dados: { titulo: 'C' }, atualizado_em: diasAtras(0) },
        { tmdb_id: 2006, tipo: 'movie', status: 'nao_interessa', dados: { titulo: 'D' }, atualizado_em: diasAtras(730) },
        { tmdb_id: 2007, tipo: 'movie', status: 'ja_vi', nota: 4, dados: { titulo: 'E' }, atualizado_em: diasAtras(0) },
      ],
    },
    AGORA
  );
  const por = Object.fromEntries(base.itens.map((x) => [x.tmdb_id, x]));
  assert.deepEqual(Object.keys(por).map(Number).sort(), [2001, 2002, 2003, 2006, 2007], 'linha sem nome, série e filme fora da base não entram');
  assert.deepEqual([por[2001].s, por[2001].r, por[2001].w], [0.4, 1, 0.4]);
  assert.deepEqual([por[2002].s, por[2002].r, por[2002].w], [0.8, 0.75, 0.6]);
  assert.deepEqual([por[2003].fonte, por[2003].s, por[2003].w], ['nota', -1, -1], 'a nota vence o histórico');
  assert.deepEqual([por[2006].s, por[2006].w], [-0.6, -0.45]);
  assert.deepEqual([por[2007].s, por[2007].w], [0.5, 0.5]);
});

test('base completa: TODOS os filmes conhecidos entram; com menos de 20, peso reduzido e aviso', () => {
  const hist = (n) => FILMES.slice(0, n).map((id) => ({ titulo_original: `F${id}`, titulo_tmdb: `F${id}`, tmdb_id: id, tipo: 'movie', vezes: 1, ultima_data: diasAtras(10) }));
  const cheia = montarBase({ historico: hist(30) }, AGORA);
  assert.equal(cheia.disponiveis, 30, 'nenhum limite de favoritos: os 30 entram');
  assert.equal(cheia.alfa, 1);
  assert.equal(cheia.aviso, null);

  const pouca = montarBase({ historico: hist(5) }, AGORA);
  assert.equal(pouca.disponiveis, 5);
  assert.equal(pouca.alfa, 5 / MINIMO_BASE);
  assert.match(pouca.aviso, /5 de 20/);

  const nada = montarBase({ historico: [] }, AGORA);
  assert.equal(nada.alfa, 0);
  assert.match(nada.aviso, /desligado/);
});

test('sinal do candidato: soma de peso × similaridade; peso negativo empurra para baixo; α aplicado', () => {
  const base = { alfa: 1, itens: [{ tmdb_id: 2001, titulo: 'A', w: 1 }, { tmdb_id: 2030, titulo: 'Odiei', w: -1 }] };
  const calc = movielens.calcularBase(base);
  const s4100 = movielens.sinalDoCandidato(calc, 4100);
  assert.equal(s4100.S, 0.1 - 0.5, '0,1 (de A) − 0,5 (de "Odiei")');
  assert.ok(s4100.pontos < 0, 'termina negativo');
  assert.equal(s4100.contribuintes[0].titulo, 'Odiei');
  const meio = movielens.sinalDoCandidato(movielens.calcularBase({ ...base, alfa: 0.5 }), 4004);
  const cheio = movielens.sinalDoCandidato(calc, 4004);
  assert.equal(meio.pontos, Math.round(cheio.pontos * 0.5 * 100) / 100, 'α = 0,5 corta os pontos pela metade');
  assert.ok(cheio.pontos <= 3 && s4100.pontos >= -1.5, 'limites de +3 e −1,5');
});

// ---------- Ponta a ponta ----------
const tabelas = {
  quiz_answers: [{ question_id: 8, option_ids: ['scifi_cerebral'] }],
  watch_history_import: FILMES.slice(0, 25).map((id, i) => ({
    titulo_original: `Filme ${id}`, titulo_tmdb: `Filme ${id}`, tmdb_id: id, tipo: 'movie',
    vezes: i % 3 ? 1 : 2, peso: i % 3 ? 0.5 : 1, generos: [878], idioma_original: 'en', ano: '2010', ultima_data: '2025-06-01',
  })),
  // Notas 5★ recentes: prova forte (com "× força da base", só "visto 1 vez" pesaria pouco)
  user_titles: FILMES.slice(0, 25).map((id) => ({ tmdb_id: id, tipo: 'movie', status: 'ja_vi', nota: 5, origem: 'app', dados: { titulo: `Filme ${id}`, genre_ids: [878] }, atualizado_em: new Date().toISOString() })),
};
const db = bancoFalso(tabelas);
const { gerarPerfil } = await import('../server/services/profileService.js');
const { obterRecomendacoes } = await import('../server/services/recommendationService.js');
await gerarPerfil(db, 'u-ml');
const recs = await obterRecomendacoes(db, 'u-ml', {});

test('ponta a ponta: a base usa os 25 filmes (100% dos disponíveis, acima do mínimo de 20)', () => {
  assert.equal(recs.movielens_base.disponiveis, 25);
  assert.equal(recs.movielens_base.alfa, 1);
  assert.equal(recs.movielens_base.aviso, null);
});

test('ponta a ponta: o MovieLens NÃO pode ter contribuição zero', () => {
  const filmes = recs.itens.filter((t) => t.tipo === 'movie');
  const comMl = filmes.filter((t) => t.rastreamento.componentes.movielens > 0);
  assert.ok(comMl.length > 0, 'pelo menos uma recomendação tem pontos do MovieLens');
  // Todo filme recomendado que a base conhece e que se liga aos filmes da pessoa recebe o sinal (critério A4, 1ª parte)
  const ligados = filmes.filter((t) => t.rastreamento.movielens.quantos_titulos_seus > 0);
  assert.ok(ligados.length >= 3, `${ligados.length} filmes ligados à base`);
  assert.ok(ligados.every((t) => t.rastreamento.componentes.movielens !== 0), 'nenhum filme ligado à base fica com zero');
  // (A 2ª parte do A4, "≥ 25% das 20 finais", é medida com os dados reais: scripts/avaliacao/)
  assert.ok(comMl.every((t) => t.rastreamento.movielens.contribuintes.every((c) => FILMES.includes(c.tmdb_id))), 'quem gerou o sinal são filmes da pessoa');
});

test('ponta a ponta: rastreamento soma exatamente a pontuação (critério A3) e séries ficam de fora do MovieLens', () => {
  for (const t of recs.itens) {
    const soma = Object.values(t.rastreamento.componentes).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(soma - t.rastreamento.total) <= 0.01, `${t.titulo}: ${soma} ≠ ${t.rastreamento.total}`);
    if (t.tipo === 'tv') {
      assert.equal(t.rastreamento.componentes.movielens, 0);
      assert.equal(t.rastreamento.movielens.aplicavel, false);
    }
  }
});
