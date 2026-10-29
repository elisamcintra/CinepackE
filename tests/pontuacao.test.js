// Testes das regras de pontuação (sem internet, sem IA)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarHumor, compatibilidadePorScore, diversificar, motivoPorRegras, notaBayesiana, pontuar } from '../server/services/scoring.js';
import { detalhesDoTitulo, similaridade } from '../server/services/tasteSignature.js';

const titulo = (extra) => ({
  tmdb_id: 1,
  tipo: 'movie',
  titulo: 'X',
  genre_ids: [878],
  palavras_chave: [],
  diretores: [],
  elenco: [],
  idioma_original: 'en',
  ano: '2019',
  nota_tmdb: 7,
  votos: 1000,
  ...extra,
});

test('nota bayesiana desconfia de notas altas com poucos votos', () => {
  const poucosVotos = notaBayesiana({ nota_tmdb: 9.5, votos: 12 });
  const muitosVotos = notaBayesiana({ nota_tmdb: 8.2, votos: 20000 });
  assert.ok(muitosVotos > poucosVotos, `${muitosVotos} deveria ser > ${poucosVotos}`);
  assert.ok(poucosVotos < 7.2);
});

test('similaridade: título com os mesmos temas e diretora dos favoritos ganha; tema rejeitado perde', () => {
  const assinatura = {
    vetor: { 'kw:1': 0.9, 'kw:2': 0.6, 'p:Diretora A': 0.8, 'kw:3': -0.7 },
    rotulos: { 'kw:1': { texto: 'viagem no tempo', tipo: 'tema' }, 'kw:2': { texto: 'distopia', tipo: 'tema' }, 'p:Diretora A': { texto: 'Diretora A', tipo: 'direcao' }, 'kw:3': { texto: 'cidade pequena', tipo: 'tema' } },
    norma: Math.sqrt(0.81 + 0.36 + 0.64 + 0.49),
  };
  const parecido = titulo({ palavras_chave: [{ id: 1, nome: 'time travel' }, { id: 2, nome: 'dystopia' }], diretores: ['Diretora A'] });
  const oposto = titulo({ palavras_chave: [{ id: 3, nome: 'small town' }] });
  const sp = similaridade(parecido, assinatura);
  const so = similaridade(oposto, assinatura);
  assert.ok(sp.cos > 0.5, `cos ${sp.cos}`);
  assert.ok(so.cos < 0);
  assert.deepEqual(sp.destaques.map((d) => d.texto).sort(), ['Diretora A', 'distopia', 'viagem no tempo'].sort());
  assert.equal(so.alertas[0].texto, 'cidade pequena');

  const perfil = { assinatura };
  assert.ok(pontuar(parecido, perfil).score > pontuar(oposto, perfil).score + 3);
});

test('palavras-chave genéricas são ignoradas na assinatura', () => {
  const f = detalhesDoTitulo(titulo({ palavras_chave: [{ id: 5, nome: 'duringcreditsstinger' }, { id: 6, nome: 'heist' }] }));
  assert.ok(!f.has('kw:5'));
  assert.ok(f.has('kw:6'));
});

test('consenso: recomendado a partir de vários favoritos pontua mais', () => {
  const t = titulo();
  const um = pontuar(t, {}, { parecidoCom: 'Dark', sementes: 1 }).score;
  const tres = pontuar(t, {}, { parecidoCom: 'Dark', sementes: 3 }).score;
  assert.ok(tres > um);
  const r = pontuar(t, {}, { parecidoCom: 'Dark', sementes: 3 });
  assert.match(motivoPorRegras(t, r.razoes), /3 títulos que você curtiu/);
});

test('gênero evitado com nuance pesa menos contra que sem nuance', () => {
  const t = titulo({ genre_ids: [10749] });
  const semNuance = pontuar(t, { generos_evitar: [{ chave: 'romance', forca: 1, nuance: null }] }).score;
  const comNuance = pontuar(t, { generos_evitar: [{ chave: 'romance', forca: 1, nuance: 'aceita europeu' }] }).score;
  assert.ok(comNuance > semNuance);
});

test('compatibilidade fica entre 35% e 98% e cresce com a pontuação', () => {
  assert.equal(compatibilidadePorScore(-10), 35);
  assert.equal(compatibilidadePorScore(20), 98);
  assert.ok(compatibilidadePorScore(5) > compatibilidadePorScore(2));
});

test('variedade (MMR): evita colocar no topo vários títulos quase iguais', () => {
  const igual = (id, score) => ({ t: titulo({ tmdb_id: id, palavras_chave: [{ id: 1, nome: 'a' }, { id: 2, nome: 'b' }] }), score, sinais: { parecidoCom: 'Dark' } });
  const diferente = { t: titulo({ tmdb_id: 99, tipo: 'tv', genre_ids: [35], palavras_chave: [{ id: 50, nome: 'z' }] }), score: 4.5, sinais: {} };
  const lista = [igual(1, 5), igual(2, 4.9), igual(3, 4.8), diferente];
  const ordem = diversificar(lista).map((x) => x.t.tmdb_id);
  assert.equal(ordem[0], 1);
  assert.equal(ordem[1], 99, 'o diferente sobe para o 2º lugar');
});

test('humor do dia: "até 1h30" filtra filmes longos e mantém o mínimo', () => {
  const itens = Array.from({ length: 12 }, (_, i) => titulo({ tmdb_id: i, duracao: i < 4 ? 85 : 150 }));
  const { itens: r, aviso } = aplicarHumor(itens, { tempo: 'ate_1h30' }, 10);
  assert.equal(r.length, 10);
  assert.ok(r.slice(0, 4).every((t) => t.duracao <= 95));
  assert.ok(aviso);
});
