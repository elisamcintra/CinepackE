// Gêneros "unificados" do CineMatch.
//
// Por que não usar só o ID do TMDB? Porque filmes e séries têm listas DIFERENTES no TMDB:
// "Ficção científica" é 878 em filmes, mas em séries vira "Sci-Fi & Fantasy" (10765).
// Séries nem têm "Romance", "Terror" ou "Suspense". Por isso cada gênero aqui tem uma
// `chave` própria e sabe como se traduzir para filmes e para séries.
// Quando a série não tem o gênero, usamos uma palavra-chave do TMDB (`tvKeyword`).

export const GENEROS = [
  { chave: 'acao', nome: 'Ação', movie: [28], tv: [10759] },
  { chave: 'aventura', nome: 'Aventura', movie: [12], tv: [10759] },
  { chave: 'animacao', nome: 'Animação', movie: [16], tv: [16] },
  { chave: 'comedia', nome: 'Comédia', movie: [35], tv: [35] },
  { chave: 'crime', nome: 'Crime', movie: [80], tv: [80] },
  { chave: 'documentario', nome: 'Documentário', movie: [99], tv: [99] },
  { chave: 'drama', nome: 'Drama', movie: [18], tv: [18] },
  { chave: 'familia', nome: 'Família', movie: [10751], tv: [10751] },
  { chave: 'fantasia', nome: 'Fantasia', movie: [14], tv: [10765] },
  { chave: 'historia', nome: 'História', movie: [36], tv: [10768] },
  { chave: 'terror', nome: 'Terror', movie: [27], tv: [], tvKeyword: 'horror' },
  { chave: 'misterio', nome: 'Mistério', movie: [9648], tv: [9648] },
  { chave: 'romance', nome: 'Romance', movie: [10749], tv: [], tvKeyword: 'romance' },
  { chave: 'scifi', nome: 'Ficção científica', movie: [878], tv: [10765] },
  { chave: 'thriller', nome: 'Suspense', movie: [53], tv: [], tvKeyword: 'thriller' },
  { chave: 'guerra', nome: 'Guerra e política', movie: [10752], tv: [10768] },
  { chave: 'musica', nome: 'Música', movie: [10402], tv: [] },
  { chave: 'faroeste', nome: 'Faroeste', movie: [37], tv: [37] },
  { chave: 'reality', nome: 'Reality show', movie: [], tv: [10764] },
  { chave: 'infantil', nome: 'Infantil', movie: [], tv: [10762] },
];

export const CHAVES_GENERO = GENEROS.map((g) => g.chave);
const porChave = new Map(GENEROS.map((g) => [g.chave, g]));

export function generoPorChave(chave) {
  return porChave.get(chave);
}

export function nomeGenero(chave) {
  return porChave.get(chave)?.nome || chave;
}

// Caminho inverso: ID do TMDB -> chaves do CineMatch (ex.: série 10765 -> scifi e fantasia)
export function chavesDoGeneroTmdb(tipo, id) {
  return GENEROS.filter((g) => g[tipo].includes(id)).map((g) => g.chave);
}

export function chavesDoTitulo(tipo, genreIds = []) {
  return [...new Set(genreIds.flatMap((id) => chavesDoGeneroTmdb(tipo, id)))];
}

// Clima / humor do dia -> pesos de gênero usados para reordenar resultados
export const CLIMAS = {
  leve: { comedia: 1, familia: 0.8, animacao: 0.6, romance: 0.3, terror: -1, guerra: -0.8, crime: -0.5, thriller: -0.5 },
  intenso: { acao: 1, thriller: 1, crime: 0.8, guerra: 0.5, terror: 0.4, familia: -0.8, comedia: -0.4 },
  pensar: { scifi: 1, misterio: 0.8, documentario: 0.8, drama: 0.5, historia: 0.5, comedia: -0.3, familia: -0.5 },
  rir: { comedia: 1.2, animacao: 0.4, familia: 0.3, terror: -0.8, guerra: -0.8, drama: -0.3 },
  chorar: { drama: 1.2, romance: 0.7, historia: 0.3, comedia: -0.4, acao: -0.4 },
};
