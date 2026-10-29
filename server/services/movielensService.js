// Conhecimento minerado do MovieLens (gerado por `npm run mineracao`, ver scripts/mineracao/).
//
// O arquivo server/data/movielens.json.gz traz, para cada filme (pelo ID do TMDB):
//   - os 50 filmes mais parecidos segundo o comportamento de ~200 mil pessoas
//     (similaridade, confiança e lift da regra de associação)
//   - a "família de gosto" (cluster do k-means)
// Se o arquivo não existir, tudo continua funcionando sem esse sinal.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const ARQUIVO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'movielens.json.gz');

let dados; // undefined = ainda não tentou carregar; null = indisponível

function preparar(obj) {
  const filmes = new Map(Object.entries(obj.filmes || {}).map(([tmdb, f]) => [Number(tmdb), f]));
  const clusters = new Map((obj.clusters || []).map((c) => [c.id, c]));
  return { ...obj, filmes, clusters };
}

function carregar() {
  if (dados !== undefined) return dados;
  if (!existsSync(ARQUIVO)) {
    console.warn('  ⚠ MovieLens não minerado ainda: rode "npm run mineracao:baixar" e "npm run mineracao" para ativar a filtragem colaborativa');
    dados = null;
    return dados;
  }
  try {
    const inicio = Date.now();
    dados = preparar(JSON.parse(gunzipSync(readFileSync(ARQUIVO)).toString('utf8')));
    console.log(`[movielens] ${dados.filmes.size.toLocaleString('pt-BR')} filmes carregados em ${Date.now() - inicio}ms`);
  } catch (e) {
    console.warn('[movielens] não consegui ler o arquivo:', e.message);
    dados = null;
  }
  return dados;
}

// Para testes: usa dados prontos (ou null para simular "sem MovieLens")
export function carregarDe(obj) {
  dados = obj ? preparar(obj) : null;
}

export function disponivel() {
  return !!carregar();
}

export function status() {
  const d = carregar();
  if (!d) return { carregado: false };
  return {
    carregado: true,
    filmes: d.filmes.size,
    pessoas: d.estatisticas?.pessoas,
    base: d.fonte?.base,
    gerado_em: d.gerado_em,
  };
}

// Filmes parecidos com um filme: [{ tmdb_id, titulo, sim, confianca, lift }]
// confianca = das pessoas que gostaram do filme, quantas % também gostaram do vizinho
export function vizinhos(tmdbId, n = 50) {
  const f = carregar()?.filmes.get(Number(tmdbId));
  if (!f) return [];
  return f.v.slice(0, n).map(([tmdb, sim, confianca, lift]) => ({
    tmdb_id: tmdb,
    titulo: dados.filmes.get(tmdb)?.t || null,
    sim,
    confianca,
    lift,
  }));
}

/**
 * Relação entre um filme favorito (A) e um candidato (B), se o MovieLens conhecer o par.
 * Devolve { sim, confianca (A ⇒ B), lift } ou null.
 */
export function relacao(favoritoId, candidatoId) {
  const d = carregar();
  if (!d) return null;
  const a = d.filmes.get(Number(favoritoId));
  const b = d.filmes.get(Number(candidatoId));
  if (!a || !b) return null;
  const direta = a.v.find((x) => x[0] === Number(candidatoId));
  if (direta) return { sim: direta[1], confianca: direta[2], lift: direta[3] };
  const inversa = b.v.find((x) => x[0] === Number(favoritoId));
  if (!inversa || !a.n) return null;
  // A lista de B guarda a confiança B ⇒ A; convertemos para A ⇒ B usando quantas pessoas gostaram de cada um
  return { sim: inversa[1], confianca: Math.min(1, (inversa[2] * b.n) / a.n), lift: inversa[3] };
}

// O MovieLens conhece este filme? (para montar a base da pessoa)
export function conhece(tmdbId) {
  return !!carregar()?.filmes.has(Number(tmdbId));
}

export function tituloOriginal(tmdbId) {
  return carregar()?.filmes.get(Number(tmdbId))?.t || '';
}

export function parametros() {
  return carregar()?.parametros || null;
}

/**
 * Calcula o sinal do MovieLens para TODOS os filmes a partir da base da pessoa (movielensBase.js):
 *   S(c) = Σ wᵢ · sim(i → c), somando cada título i da base que tem c entre os vizinhos.
 * Pesos negativos (notas baixas, "Não me interessa") empurram c para baixo.
 * Referência de escala: percentil 95 dos S positivos desta pessoa (independe do tamanho da base).
 */
export function calcularBase(base) {
  const d = carregar();
  if (!d || !base?.itens?.length) return null;
  // Modelo por tamanho da base (escolhido nos experimentos): bases grandes usam a lista do EASE, se existir
  const minimoEase = d.parametros?.easeAPartirDe || 0;
  const usarEase = minimoEase > 0 && base.itens.length >= minimoEase;
  const S = new Map();
  const contrib = new Map();
  let usados = 0;
  for (const b of base.itens) {
    const f = d.filmes.get(Number(b.tmdb_id));
    if (!f) continue;
    usados++;
    if (!b.w) continue;
    for (const [c, sim, confianca, lift] of (usarEase && f.e) || f.v) {
      const valor = b.w * sim;
      S.set(c, (S.get(c) || 0) + valor);
      if (!contrib.has(c)) contrib.set(c, []);
      contrib.get(c).push({ tmdb_id: b.tmdb_id, titulo: b.titulo, peso: b.w, sim, confianca, lift, contribuicao: valor });
    }
  }
  const positivos = [...S.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const ref = positivos.length ? positivos[Math.floor(0.95 * (positivos.length - 1))] || positivos.at(-1) : 1;
  // Força média da base (0 a 1): só "vi uma vez" (+0,4) é prova fraca; notas 5★ (+1) são prova forte
  const forca = base.itens.length ? base.itens.reduce((a, b) => a + Math.abs(b.w || 0), 0) / base.itens.length : 0;
  return { S, contrib, ref, alfa: base.alfa ?? 1, forca: Math.round(forca * 1000) / 1000, disponiveis: base.itens.length, usados, modelo: usarEase ? 'ease' : d.parametros?.modelo || 'item-item' };
}

/**
 * Como os pontos do MovieLens entram na nota (escolhido pela avaliação com os dados da pessoa, ver docs):
 *   forca:   multiplica pela força média da base (prova fraca pesa menos)
 *   centrar: subtrai a média dos pontos entre os filmes candidatos; o MovieLens reordena os FILMES
 *            entre si sem empurrar filmes acima de séries (séries não têm esse sinal)
 */
// Padrão: "× força, centrado" (a variação com menor perda nos dados da usuária; ver docs/avaliacao/RESULTADOS.md).
// Dá para trocar no server/.env: MOVIELENS_ESCALA=forca,centrar | forca | centrar | nenhuma
const ESCALA_ENV = process.env.MOVIELENS_ESCALA;
export const ESCALA_PADRAO = ESCALA_ENV
  ? { forca: ESCALA_ENV.includes('forca'), centrar: ESCALA_ENV.includes('centrar') }
  : { forca: true, centrar: true };

export const PONTOS_MAX = 3;
export const PONTOS_MIN = -1.5;

/**
 * Sinal de um filme candidato: { S, pontos, contribuintes (os 5 maiores, em módulo), melhor }.
 * pontos = α × limite(3 × S / referência, −1,5, +3): um filme no top 5% desta pessoa ganha ~3 pontos.
 */
export function sinalDoCandidato(calc, candidatoId, escala = ESCALA_PADRAO) {
  if (!calc) return null;
  const s = calc.S.get(Number(candidatoId)) || 0;
  const lista = (calc.contrib.get(Number(candidatoId)) || []).sort((a, b) => Math.abs(b.contribuicao) - Math.abs(a.contribuicao));
  const bruto = Math.max(PONTOS_MIN, Math.min(PONTOS_MAX, (PONTOS_MAX * s) / calc.ref));
  const arred = (v, c = 3) => Math.round(v * 10 ** c) / 10 ** c;
  return {
    S: arred(s, 4),
    pontos: arred(calc.alfa * (escala.forca ? calc.forca : 1) * bruto, 2),
    alfa: calc.alfa,
    contribuintes: lista.slice(0, 5).map((x) => ({ ...x, sim: arred(x.sim, 4), contribuicao: arred(x.contribuicao, 4), confianca: arred(x.confianca), lift: arred(x.lift, 2) })),
    quantos: lista.length,
    melhor: lista.find((x) => x.contribuicao > 0) || null,
  };
}

// Os n filmes com maior sinal (candidatos novos vindos só do MovieLens)
export function melhoresDaBase(calc, n, excluir = new Set()) {
  if (!calc) return [];
  return [...calc.S.entries()]
    .filter(([id, s]) => s > 0 && !excluir.has(`movie:${id}`))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

// Família de gosto (cluster do k-means) de um filme
export function familia(tmdbId) {
  const d = carregar();
  const f = d?.filmes.get(Number(tmdbId));
  return f ? d.clusters.get(f.c) || null : null;
}

// Regras de associação de um filme, as mais fortes primeiro (para a página Meu gosto)
export function regras(tmdbId, n = 3, { minConfianca = 0.3, minLift = 1.5 } = {}) {
  return vizinhos(tmdbId)
    .filter((v) => v.confianca >= minConfianca && v.lift >= minLift)
    .sort((a, b) => b.confianca * Math.log(b.lift) - a.confianca * Math.log(a.lift))
    .slice(0, n);
}
