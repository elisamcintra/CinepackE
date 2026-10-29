// Temas que a pessoa pode BLOQUEAR (nunca recomendar). Cada tema vira palavras-chave do TMDB
// (os IDs são procurados na hora de salvar, pelo nome exato) e/ou gêneros do app.
export const TEMAS_BLOQUEAVEIS = {
  video_games: { nome: 'Video games', termos: ['based on video game', 'video game'] },
  anime: { nome: 'Anime', termos: ['anime'] },
  super_herois: { nome: 'Super-heróis', termos: ['superhero', 'superhero team', 'based on comic'] },
  zumbis: { nome: 'Zumbis', termos: ['zombie', 'zombie apocalypse'] },
  vampiros: { nome: 'Vampiros', termos: ['vampire'] },
  esportes: { nome: 'Esportes', termos: ['sports', 'boxing', 'football (soccer)', 'basketball'] },
  terror: { nome: 'Terror', generos: ['terror'] },
  reality: { nome: 'Reality shows', generos: ['reality'] },
  infantil: { nome: 'Infantil', generos: ['infantil'] },
  guerra: { nome: 'Guerra e política', generos: ['guerra'] },
};
