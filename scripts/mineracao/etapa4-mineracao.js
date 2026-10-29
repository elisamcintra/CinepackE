// ETAPA 4 DO KDD: MINERAÇÃO
// Aqui os padrões são extraídos das transações (filmes que cada pessoa gostou). Três técnicas:
//
// 1. COOCORRÊNCIA: para cada par de filmes (A, B), quantas pessoas gostaram dos dois.
//    Guardamos só metade da matriz (A,B = B,A) num Uint32Array, para caber na memória.
//
// 2. REGRAS DE ASSOCIAÇÃO (ideia do algoritmo Apriori, com pares de filmes):
//      suporte(A⇒B)   = % de todas as pessoas que gostaram de A e de B
//      confiança(A⇒B) = das pessoas que gostaram de A, quantas % também gostaram de B
//      lift(A⇒B)      = confiança ÷ % geral de quem gosta de B   (>1 = associação real; 1 = acaso)
//    E a SIMILARIDADE ITEM-ITEM (filtragem colaborativa):
//      sim(A,B) = coocorrência ÷ √(curtidas_A × curtidas_B) × encolhimento
//    O "encolhimento" reduz a nota de pares com poucas pessoas em comum.
//
// 3. CLUSTERIZAÇÃO (k-means): agrupa filmes em "famílias de gosto" pelo comportamento das pessoas,
//    sem olhar o gênero oficial. Cada filme ganha um "resumo numérico" (embedding): a soma de vetores
//    aleatórios dos seus vizinhos, pesada por log(lift). Usar o lift (e não a contagem bruta) tira o
//    efeito da popularidade: senão todos os filmes famosos cairiam na mesma família.

import { carregarConteudo } from './conteudo.js';
import { paraCadaTransacao } from './etapa3-transformacao.js';
import { construirEase, construirVizinhos } from './similaridade.js';
import { criarAleatorio, lerBinario, lerJson, salvarJson } from './util.js';

const GENEROS_PT = {
  Action: 'Ação', Adventure: 'Aventura', Animation: 'Animação', Children: 'Infantil', Comedy: 'Comédia',
  Crime: 'Crime', Documentary: 'Documentário', Drama: 'Drama', Fantasy: 'Fantasia', 'Film-Noir': 'Noir',
  Horror: 'Terror', Musical: 'Musical', Mystery: 'Mistério', Romance: 'Romance', 'Sci-Fi': 'Ficção científica',
  Thriller: 'Suspense', War: 'Guerra', Western: 'Faroeste',
};

/**
 * Conta, para cada par de filmes, quantas pessoas gostaram dos dois (matriz triangular).
 * Com meiaVidaPessoaDias > 0, também guarda a contagem PONDERADA pela recência de cada pessoa
 * (quem curtiu há mais tempo pesa menos): w = 0,5 + 0,5 · 2^(−dias/meia-vida).
 */
export function contarCoocorrencia(cfg) {
  const p = cfg.parametros;
  const itens = lerJson(cfg.dirProcessado, 'etapa2-itens.json');
  const treino = lerBinario(cfg.dirProcessado, 'etapa3-treino.bin', Int32Array);
  const n = itens.length;
  const memoriaMb = ((n * (n - 1)) / 2) * 4 / 1e6;
  console.log(`   ${n.toLocaleString('pt-BR')} filmes → matriz de coocorrência de ~${Math.round(memoriaMb)} MB`);
  if (memoriaMb > 1500) throw new Error('Muitos filmes para a memória. Aumente minAvaliacoesFilme em scripts/mineracao/config.js.');

  const recencia = p.meiaVidaPessoaDias > 0;
  const tempo = recencia ? lerBinario(cfg.dirProcessado, 'etapa3-treino-tempo.bin', Int32Array) : null;
  const diaRef = tempo ? tempo.reduce((m, d) => Math.max(m, d), 0) : 0;
  const curtidas = new Int32Array(n);
  const co = new Uint32Array((n * (n - 1)) / 2);
  const curtidasW = recencia ? new Float64Array(n) : null;
  const coW = recencia ? new Float32Array(co.length) : null;
  let U = 0;
  let pares = 0;

  paraCadaTransacao(treino, (filmes) => {
    const w = recencia ? 0.5 + 0.5 * Math.pow(2, -(diaRef - tempo[U]) / p.meiaVidaPessoaDias) : 1;
    U++;
    const ids = Int32Array.from(filmes).sort();
    for (let a = 0; a < ids.length; a++) {
      const i = ids[a];
      curtidas[i]++;
      if (recencia) curtidasW[i] += w;
      const base = (i * (2 * n - i - 1)) / 2 - i - 1;
      for (let b = a + 1; b < ids.length; b++) {
        co[base + ids[b]]++;
        if (recencia) coW[base + ids[b]] += w;
      }
      pares += ids.length - a - 1;
    }
    if (U % 20000 === 0 && process.stdout.isTTY) process.stdout.write(`\r   Contando pares… ${U.toLocaleString('pt-BR')} pessoas`);
  });
  if (process.stdout.isTTY) process.stdout.write('\r');
  console.log(`   ${pares.toLocaleString('pt-BR')} pares de filmes contados (${U.toLocaleString('pt-BR')} pessoas)`);
  return { itens, n, U, pares, curtidas, co, curtidasW, coW };
}

export async function etapa4Mineracao(cfg) {
  const p = cfg.parametros;
  const D = p.dimensoesEmbedding;
  const sorteio = criarAleatorio(p.semente);

  // ---------- 1. Coocorrência ----------
  const dados = contarCoocorrencia(cfg);
  const { itens, n, U, pares, curtidas } = dados;

  // ---------- 2. Similaridade + regras de associação ----------
  const conteudo = p.conteudo?.length && p.gamaConteudo ? await carregarConteudo(cfg, p.conteudo) : {};
  const { vizinhos, regras, kappa } = construirVizinhos(dados, p, conteudo, { dirCache: cfg.dirProcessado });
  const regrasEncontradas = regras.total;
  const melhoresRegras = regras.melhores;
  console.log(`   Similaridade: ${p.modelo}${p.modelo === 'ease' ? ` (λ = ${p.easeLambda})` : ` (α = ${p.alfa})`}${p.gamaConteudo ? `, conteúdo ${p.conteudo.join('+')} γ = ${p.gamaConteudo}` : ''}${p.meiaVidaPessoaDias ? `, recência ${p.meiaVidaPessoaDias} dias` : ''}`);
  if (p.modelo !== 'ease') console.log(`   ${regrasEncontradas.toLocaleString('pt-BR')} regras de associação (confiança ≥ ${p.minConfianca * 100}%, lift ≥ ${p.minLift})`);
  if (kappa) console.log('   Escala do conteúdo (κ):', JSON.stringify(kappa));
  // Modelo por tamanho da base: também guarda a lista do EASE, usada por quem tem >= easeAPartirDe filmes
  const vizinhosEase = p.easeAPartirDe > 0 ? construirEase(dados, { ...p, modelo: 'ease' }, cfg.dirProcessado).cf.map((l) => l.slice(0, p.vizinhosPorFilme)) : null;
  if (vizinhosEase) console.log(`   EASE (λ = ${p.easeLambda}) para bases com ${p.easeAPartirDe}+ filmes`);

  // ---------- 3. K-means nas "famílias de gosto" ----------
  // Embedding de cada filme: ele mesmo + vizinhos, cada um representado por um vetor aleatório
  // de ±1 (projeção aleatória) e pesado por log(lift), que mede afinidade sem o efeito da popularidade.
  const aleatorio = new Float32Array(n * D);
  for (let x = 0; x < aleatorio.length; x++) aleatorio[x] = sorteio() < 0.5 ? -1 : 1;
  const embedding = new Float32Array(n * D);
  for (let i = 0; i < n; i++) {
    const off = i * D;
    let pesoProprio = 0;
    for (const [j, , , lift] of vizinhos[i]) {
      const w = Math.log(lift);
      if (w <= 0) continue;
      pesoProprio = Math.max(pesoProprio, w);
      for (let d = 0; d < D; d++) embedding[off + d] += w * aleatorio[j * D + d];
    }
    for (let d = 0; d < D; d++) embedding[off + d] += (pesoProprio || 1) * aleatorio[off + d];
  }
  const { cluster, clusters } = kmeans(embedding, n, D, p, itens, curtidas, sorteio);
  console.log(`   ${clusters.length} famílias de gosto (k-means)`);

  const arred = (v, c) => Math.round(v * 10 ** c) / 10 ** c;
  const estatisticas = {
    pessoas: U,
    filmes: n,
    pares_contados: pares,
    regras_encontradas: regrasEncontradas,
    familias: clusters.length,
  };
  salvarJson(cfg.dirProcessado, 'etapa4-mineracao.json', {
    U,
    curtidas: Array.from(curtidas),
    // Similaridades pequenas (EASE) guardam mais casas para não virar zero
    vizinhos: vizinhos.map((lista) => lista.map(([j, s, c, l]) => [j, arred(s, s < 0.01 ? 6 : 4), arred(c, 4), arred(l, 3)])),
    vizinhosEase,
    cluster: Array.from(cluster),
    clusters,
    melhoresRegras,
  });
  salvarJson(cfg.dirProcessado, 'etapa4-estatisticas.json', estatisticas);
  return estatisticas;
}

// k-means com distância de cosseno e inicialização k-means++ (os centros iniciais ficam espalhados)
function kmeans(embedding, n, D, p, itens, curtidas, sorteio) {
  const k = Math.min(p.kClusters, Math.max(1, Math.floor(n / 5)));

  // Normaliza cada vetor (tamanho 1): assim o produto escalar = cosseno
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let d = 0; d < D; d++) s += embedding[i * D + d] ** 2;
    const norma = Math.sqrt(s) || 1;
    for (let d = 0; d < D; d++) embedding[i * D + d] /= norma;
  }
  const cos = (i, centros, c) => {
    let s = 0;
    for (let d = 0; d < D; d++) s += embedding[i * D + d] * centros[c * D + d];
    return s;
  };

  // k-means++: 1º centro aleatório; os próximos com chance proporcional à distância dos já escolhidos
  const centros = new Float32Array(k * D);
  const copiarCentro = (c, i) => centros.set(embedding.subarray(i * D, i * D + D), c * D);
  copiarCentro(0, Math.floor(sorteio() * n));
  const distMin = new Float64Array(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let soma = 0;
    for (let i = 0; i < n; i++) {
      const dist = Math.max(0, 1 - cos(i, centros, c - 1));
      if (dist < distMin[i]) distMin[i] = dist;
      soma += distMin[i] ** 2;
    }
    let alvo = sorteio() * soma;
    let escolhido = n - 1;
    for (let i = 0; i < n; i++) {
      alvo -= distMin[i] ** 2;
      if (alvo <= 0) {
        escolhido = i;
        break;
      }
    }
    copiarCentro(c, escolhido);
  }

  const cluster = new Int32Array(n);
  for (let it = 0; it < p.iteracoesKmeans; it++) {
    let mudou = 0;
    for (let i = 0; i < n; i++) {
      let melhor = 0;
      let melhorCos = -Infinity;
      for (let c = 0; c < k; c++) {
        const v = cos(i, centros, c);
        if (v > melhorCos) {
          melhorCos = v;
          melhor = c;
        }
      }
      if (cluster[i] !== melhor || it === 0) mudou++;
      cluster[i] = melhor;
    }
    // Recalcula os centros (média dos membros, normalizada)
    centros.fill(0);
    const tamanho = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      tamanho[cluster[i]]++;
      for (let d = 0; d < D; d++) centros[cluster[i] * D + d] += embedding[i * D + d];
    }
    for (let c = 0; c < k; c++) {
      if (!tamanho[c]) {
        copiarCentro(c, Math.floor(sorteio() * n)); // família vazia: recomeça de um filme aleatório
        continue;
      }
      let s = 0;
      for (let d = 0; d < D; d++) s += centros[c * D + d] ** 2;
      const norma = Math.sqrt(s) || 1;
      for (let d = 0; d < D; d++) centros[c * D + d] /= norma;
    }
    if (it > 0 && mudou === 0) break;
  }

  // Dá nome a cada família: gêneros mais característicos (comparados ao geral) + filmes mais populares
  const generosGeral = {};
  for (const f of itens) for (const g of f.generos) generosGeral[g] = (generosGeral[g] || 0) + 1;
  const membros = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) membros[cluster[i]].push(i);

  const clusters = membros
    .map((lista, id) => {
      if (!lista.length) return null;
      const contagem = {};
      for (const i of lista) for (const g of itens[i].generos) contagem[g] = (contagem[g] || 0) + 1;
      // Gênero característico = frequente na família E mais comum nela do que no geral
      const generos = Object.entries(contagem)
        .filter(([g, q]) => GENEROS_PT[g] && q / lista.length >= 0.25 && q / lista.length / (generosGeral[g] / n) >= 1.1)
        .map(([g, q]) => [g, (q / lista.length) * Math.sqrt(q / lista.length / (generosGeral[g] / n))])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([g]) => GENEROS_PT[g]);
      const exemplos = [...lista]
        .sort((a, b) => curtidas[b] - curtidas[a])
        .slice(0, 3)
        .map((i) => ({ tmdb: itens[i].tmdb, titulo: itens[i].titulo }));
      return { id, nome: generos.length ? generos.join(' + ') : 'Variados', generos, tamanho: lista.length, exemplos };
    })
    .filter(Boolean);

  return { cluster, clusters };
}
