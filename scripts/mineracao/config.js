// Configuração da mineração de dados (MovieLens).
// Todos os "números mágicos" do processo estão aqui, comentados, para facilitar ajustes e a apresentação.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Bases disponíveis. A "pequena" serve para testar o processo inteiro em segundos.
export const BASES = {
  completa: {
    nome: 'ml-32m',
    url: 'https://files.grouplens.org/datasets/movielens/ml-32m.zip',
    descricao: 'MovieLens 32M: 32 milhões de notas de ~200 mil pessoas (coletadas até 10/2023)',
    parametros: {
      minAvaliacoesFilme: 500, // filmes com menos notas que isso são "ruído" (pouca informação)
      minAvaliacoesUsuario: 20, // usuários com poucas notas dizem pouco sobre gosto
    },
  },
  pequena: {
    nome: 'ml-latest-small',
    url: 'https://files.grouplens.org/datasets/movielens/ml-latest-small.zip',
    descricao: 'MovieLens "latest small": 100 mil notas de ~600 pessoas (só para teste)',
    parametros: {
      minAvaliacoesFilme: 20,
      minAvaliacoesUsuario: 10,
      minCoocorrencia: 5,
      kClusters: 12,
      fracaoTeste: 0.1, // base pequena: separa mais gente para a avaliação ter sentido
      fracaoValidacao: 0.1,
    },
  },
};

// Parâmetros padrão do processo KDD (a base escolhida pode sobrescrever alguns)
export const PARAMETROS_PADRAO = {
  // Etapa 3: transformação
  notaMinimaGostou: 4, // "gostou" = nota >= 4 E nota >= média da própria pessoa
  maxGostosPorUsuario: 200, // limita usuários que avaliaram milhares de filmes (evita que poucos dominem)
  fracaoTeste: 0.02, // 2% dos usuários ficam de fora da mineração para avaliar o resultado (etapa 5)
  fracaoValidacao: 0.02, // outros 2% ficam de fora para ESCOLHER parâmetros (o teste só confirma no final)

  // Etapa 4: mineração
  minCoocorrencia: 30, // um par de filmes precisa ter sido curtido junto por pelo menos 30 pessoas
  minConfianca: 0.2, // regra A -> B só vale se pelo menos 20% de quem gostou de A também gostou de B
  minLift: 1.5, // ...e se essa relação for 1,5x mais forte que o acaso
  encolhimento: 20, // reduz a similaridade de pares com poucas pessoas em comum (evita "coincidências")
  vizinhosPorFilme: 50, // quantos filmes parecidos guardamos para cada filme

  // Similaridade: configuração escolhida em docs/mineracao/experimentos.md (validação + teste).
  // O modelo original está em MODELO_ORIGINAL (abaixo) e continua sendo a linha de base dos experimentos.
  modelo: 'item-item', // 'item-item' (cosseno) ou 'ease' (regressão linear fechada, Steck 2019)
  alfa: 0.5, // cosseno assimétrico: co / (nA^(1-alfa) · nB^alfa), B = candidato. 0,5 = cosseno normal; maior = menos peso a candidatos populares
  meiaVidaPessoaDias: 0, // recência na mineração: pessoas ativas há mais tempo pesam menos (0 = desligado)
  conteudo: ['tmdb', 'tags'], // fontes de conteúdo misturadas à similaridade: 'tmdb', 'tags', 'genome' (M5 e M6a aceitas)
  gamaConteudo: 0.35, // quanto da similaridade vem do conteúdo (0 = só comportamento)
  easeLambda: 500, // regularização do EASE
  easeAPartirDe: 20, // modelo por tamanho da base: pessoas com pelo menos 20 filmes usam o EASE (M3b aceita; 0 = desligado)
  kClusters: 40, // quantas "famílias de gosto" o k-means vai formar
  dimensoesEmbedding: 64, // tamanho do "resumo numérico" de cada filme usado no k-means
  iteracoesKmeans: 25,
  semente: 42, // semente do sorteio: rodar de novo dá exatamente o mesmo resultado

  // Etapa 5: avaliação
  maxUsuariosAvaliacao: 3000,
  fracaoEscondida: 0.2, // na avaliação, escondemos 20% dos filmes que a pessoa gostou e vemos se o modelo acerta
  // Como as notas da pessoa pesam na hora de recomendar (mesma fórmula do app, ver server/services/movielensBase.js):
  //   'binario' = só as curtidas, peso 1 (modelo original) | 'notas' = todas as notas, peso (nota - 3) / 2
  pesoUsuario: 'binario',
  meiaVidaUsuarioDias: 0, // recência das notas da pessoa: r = 0,5 + 0,5 · 2^(-dias/meia-vida) (0 = desligado)
};

// O modelo original (antes das melhorias): linha de base fixa dos experimentos
export const MODELO_ORIGINAL = {
  modelo: 'item-item', alfa: 0.5, meiaVidaPessoaDias: 0, conteudo: [], gamaConteudo: 0, easeAPartirDe: 0,
  pesoUsuario: 'binario', meiaVidaUsuarioDias: 0,
};

// Lê argumentos como --base=pequena --etapa=4
export function lerArgumentos(argv = process.argv.slice(2)) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

/**
 * Monta a configuração completa (pastas + parâmetros).
 * `sobrescrever` permite que os testes usem pastas temporárias e limiares próprios.
 */
export function montarConfig({ base = 'completa', sobrescrever = {} } = {}) {
  const b = BASES[base];
  if (!b) throw new Error(`Base desconhecida: ${base}. Use "completa" ou "pequena".`);
  const dirDados = path.join(RAIZ, 'dados', 'movielens');
  const completa = base === 'completa';
  return {
    base,
    nomeBase: b.nome,
    url: b.url,
    descricao: b.descricao,
    dirDados,
    dirBruto: path.join(dirDados, 'bruto', b.nome),
    dirProcessado: path.join(dirDados, 'processado', b.nome),
    // Só a base completa vira o arquivo usado pelo app; a de teste fica na pasta de dados
    saida: completa ? path.join(RAIZ, 'server', 'data', 'movielens.json.gz') : path.join(dirDados, 'processado', b.nome, 'movielens.json.gz'),
    relatorio: completa ? path.join(RAIZ, 'docs', 'mineracao', 'relatorio.md') : path.join(dirDados, 'processado', b.nome, 'relatorio.md'),
    parametros: { ...PARAMETROS_PADRAO, ...b.parametros, ...(sobrescrever.parametros || {}) },
    ...Object.fromEntries(Object.entries(sobrescrever).filter(([k]) => k !== 'parametros')),
  };
}
