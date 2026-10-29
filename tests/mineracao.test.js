// Teste da mineração de dados (as 5 etapas do KDD) com uma base sintética pequena, de padrão conhecido:
//   - metade das pessoas ama os filmes 1 a 5 (ficção) e odeia os 6 a 10 (comédia); a outra metade, o contrário
//   - o filme 11 é amado por todo mundo (popular: aparece junto de tudo, mas não é uma associação de verdade)
//   - o filme 12 não tem ID do TMDB (deve ser descartado na seleção)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { MODELO_ORIGINAL, montarConfig } from '../scripts/mineracao/config.js';
import { arrumarTitulo } from '../scripts/mineracao/etapa1-selecao.js';
import { executarMineracao } from '../scripts/mineracao/executar.js';
import * as movielens from '../server/services/movielensService.js';

const tmdb = (filme) => 100 + filme;
const FICCAO = [1, 2, 3, 4, 5];
const COMEDIA = [6, 7, 8, 9, 10];

const raiz = mkdtempSync(path.join(tmpdir(), 'cinematch-mineracao-'));
const dirBruto = path.join(raiz, 'bruto');
mkdirSync(dirBruto, { recursive: true });

const filmes = ['movieId,title,genres'];
const links = ['movieId,imdbId,tmdbId'];
for (let f = 1; f <= 12; f++) {
  const genero = FICCAO.includes(f) ? 'Sci-Fi' : COMEDIA.includes(f) ? 'Comedy' : 'Drama';
  filmes.push(`${f},"Filme ${f}, The (20${10 + f})",${genero}`);
  links.push(`${f},${1000 + f},${f === 12 ? '' : tmdb(f)}`);
}
const notas = ['userId,movieId,rating,timestamp'];
for (let u = 1; u <= 300; u++) {
  const ama = u % 2 ? COMEDIA : FICCAO;
  const odeia = u % 2 ? FICCAO : COMEDIA;
  for (const f of ama) notas.push(`${u},${f},5.0,${u}`);
  for (const f of odeia) notas.push(`${u},${f},1.0,${u}`);
  notas.push(`${u},11,5.0,${u}`, `${u},12,4.0,${u}`);
}
writeFileSync(path.join(dirBruto, 'movies.csv'), filmes.join('\n'));
writeFileSync(path.join(dirBruto, 'links.csv'), links.join('\n'));
writeFileSync(path.join(dirBruto, 'ratings.csv'), notas.join('\n'));

const cfg = montarConfig({
  base: 'pequena',
  sobrescrever: {
    dirBruto,
    dirProcessado: path.join(raiz, 'processado'),
    saida: path.join(raiz, 'saida', 'movielens.json.gz'),
    relatorio: path.join(raiz, 'saida', 'relatorio.md'),
    // Modelo original (sem conteúdo do TMDB/tags e sem EASE): é o que esta base sintética consegue testar
    parametros: {
      ...MODELO_ORIGINAL,
      minAvaliacoesFilme: 5,
      minAvaliacoesUsuario: 5,
      minCoocorrencia: 3,
      kClusters: 2,
      fracaoTeste: 0.2,
      maxUsuariosAvaliacao: 1000,
    },
  },
});

const logOriginal = console.log;
console.log = () => {}; // o processo é falante; aqui só interessa o resultado
try {
  await executarMineracao(cfg);
} finally {
  console.log = logOriginal;
}
const saida = JSON.parse(gunzipSync(readFileSync(cfg.saida)).toString('utf8'));
rmSync(raiz, { recursive: true, force: true });

test('seleção: arruma o artigo do título e descarta filme sem TMDB', () => {
  assert.equal(arrumarTitulo('Matrix, The'), 'The Matrix');
  assert.equal(arrumarTitulo('Professional, The (Le professionnel)'), 'The Professional (Le professionnel)');
  assert.equal(saida.filmes[tmdb(1)].t, 'The Filme 1');
  assert.equal(saida.filmes[tmdb(1)].a, 2011);
  assert.equal(Object.keys(saida.filmes).length, 11);
});

test('transformação: separa pessoas para teste, fora da mineração', () => {
  const { pessoas } = saida.estatisticas;
  assert.ok(pessoas > 0 && pessoas < 300, `${pessoas} pessoas no treino`);
  assert.ok(saida.avaliacao.pessoas_avaliadas > 0);
});

test('mineração: filmes do mesmo gosto viram vizinhos e regras fortes', () => {
  const vizinhos = saida.filmes[tmdb(1)].v.map(([id]) => id);
  for (const f of [2, 3, 4, 5]) assert.ok(vizinhos.includes(tmdb(f)), `filme ${f} é vizinho do 1`);
  assert.ok(!COMEDIA.some((f) => vizinhos.includes(tmdb(f))), 'comédias não aparecem: ninguém amou as duas');

  const [, sim, confianca, lift] = saida.filmes[tmdb(1)].v.find(([id]) => id === tmdb(2));
  assert.ok(sim > 0.5);
  assert.equal(confianca, 1, 'todo mundo que amou o 1 amou o 2');
  assert.ok(lift > 1.8 && lift < 2.2, `lift ${lift} (metade das pessoas ama ficção → lift 2)`);
});

test('mineração: o filme popular não vira regra (lift ≈ 1)', () => {
  movielens.carregarDe(saida);
  const regras = movielens.regras(tmdb(1), 10).map((r) => r.tmdb_id);
  assert.ok(regras.includes(tmdb(2)));
  assert.ok(!regras.includes(tmdb(11)), 'amado por todos = acaso, não associação');
});

test('k-means: ficção e comédia caem em famílias diferentes', () => {
  const c = (f) => saida.filmes[tmdb(f)].c;
  assert.ok(FICCAO.every((f) => c(f) === c(1)));
  assert.ok(COMEDIA.every((f) => c(f) === c(6)));
  assert.notEqual(c(1), c(6));
  const nomes = saida.clusters.map((x) => x.nome);
  assert.ok(nomes.includes('Ficção científica') && nomes.includes('Comédia'), nomes.join(', '));
});

test('avaliação: a filtragem colaborativa acerta os filmes escondidos', () => {
  const { colaborativo } = saida.avaliacao;
  assert.equal(colaborativo.hit_rate_10, 1);
  assert.ok(colaborativo.precision_10 > 0);
});

test('serviço do app: lê o arquivo gerado (relação, sinal da base e família)', () => {
  movielens.carregarDe(saida);
  assert.ok(movielens.disponivel());
  assert.equal(movielens.status().filmes, 11);
  const r = movielens.relacao(tmdb(2), tmdb(1));
  assert.equal(r.confianca, 1);
  const calc = movielens.calcularBase({ alfa: 1, itens: [{ tmdb_id: tmdb(1), titulo: 'A', w: 1 }, { tmdb_id: tmdb(2), titulo: 'B', w: 1 }] });
  const sinal = movielens.sinalDoCandidato(calc, tmdb(3));
  assert.equal(sinal.quantos, 2);
  assert.ok(sinal.melhor.confianca === 1 && sinal.S > 1 && sinal.pontos > 0);
  assert.equal(movielens.familia(tmdb(1)).nome, 'Ficção científica');
  assert.equal(movielens.sinalDoCandidato(calc, tmdb(6)).pontos, 0, 'sem relação: zero pontos');

  movielens.carregarDe(null);
  assert.ok(!movielens.disponivel());
  assert.deepEqual(movielens.vizinhos(tmdb(1)), []);
  assert.equal(existsSync(cfg.saida), false, 'arquivos temporários apagados');
});
