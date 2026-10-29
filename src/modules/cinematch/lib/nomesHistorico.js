// Regras de NOME para os títulos do histórico da Netflix.
// Usado no navegador (leitura do CSV) e no servidor (associação com o TMDB e geração do perfil),
// para que os dois lados sigam exatamente a mesma regra.
//
// Princípio: NUNCA adivinhar. Um título do histórico só é associado a um filme/série do TMDB
// quando o nome é idêntico. Sem nome, ou com mais de uma opção possível, não há associação automática.

// Palavras que, logo depois de um ":", indicam que o título é um episódio de série
export const MARCADORES = [
  'Temporada', 'Season', 'Parte', 'Part', 'Episódio', 'Episodio', 'Episode', 'Ep\\.',
  'Capítulo', 'Capitulo', 'Chapter', 'Minissérie', 'Minisserie', 'Limited Series',
  'Série limitada', 'Serie limitada', 'Volume', 'Vol\\.', 'Livro', 'Book',
  'Coleção', 'Colecao', 'Collection', 'Série', 'Serie', 'Series', 'Temp\\.',
];

// Título que é só "Episódio 3", "Temporada 1: Episódio 2"... (sem o nome da série)
const RE_SO_MARCADOR = new RegExp(String.raw`^(?:(?:${MARCADORES.join('|')})[\s\d.:]*)+$`, 'i');

/**
 * true quando a linha do histórico NÃO tem nome de título: vazia, só pontuação,
 * começando com ":" (ex.: " : Episódio 3", como a Netflix exporta títulos que saíram do catálogo)
 * ou só "Episódio 3" / "Temporada 1".
 */
export function semNome(titulo) {
  const t = String(titulo ?? '').trim();
  if (!/[\p{L}\p{N}]/u.test(t)) return true;
  if (/^[:\-–—]/.test(t)) return true;
  return RE_SO_MARCADOR.test(t);
}

// Qualificadores de país que a Netflix põe no fim do nome, ex.: "The Office (U.S.)"
const PAISES = {
  'u.s.': 'US', us: 'US', usa: 'US', eua: 'US', 'u.s.a.': 'US',
  'u.k.': 'GB', uk: 'GB', 'reino unido': 'GB',
  br: 'BR', brasil: 'BR', brazil: 'BR',
  mx: 'MX', 'méxico': 'MX', mexico: 'MX',
  es: 'ES', 'espanha': 'ES', spain: 'ES',
  kr: 'KR', 'coreia': 'KR', korea: 'KR',
  jp: 'JP', 'japão': 'JP', japan: 'JP',
};

/**
 * Separa um qualificador no fim do título, sem adivinhar nada:
 *   "The Office (U.S.)" -> { nome: "The Office", pais: "US" }
 *   "Roma (2018)"       -> { nome: "Roma", ano: "2018" }
 *   "Dark"              -> { nome: "Dark" }
 */
export function separarQualificador(titulo) {
  const t = String(titulo ?? '').trim();
  const m = t.match(/^(.*\S)\s*\(([^()]+)\)$/);
  if (!m) return { nome: t };
  const q = m[2].trim().toLowerCase();
  if (/^(19|20)\d{2}$/.test(q)) return { nome: m[1], ano: q };
  if (PAISES[q]) return { nome: m[1], pais: PAISES[q] };
  return { nome: t };
}
