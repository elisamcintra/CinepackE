// Idiomas originais (código ISO 639-1 usado pelo TMDB) com nome em português
export const IDIOMAS = {
  pt: 'Português',
  en: 'Inglês',
  es: 'Espanhol',
  ko: 'Coreano',
  ja: 'Japonês',
  zh: 'Chinês',
  fr: 'Francês',
  de: 'Alemão',
  it: 'Italiano',
  sv: 'Sueco',
  da: 'Dinamarquês',
  no: 'Norueguês',
  nl: 'Holandês',
  pl: 'Polonês',
  tr: 'Turco',
  hi: 'Hindi',
  th: 'Tailandês',
};

export function nomeIdioma(codigo) {
  return IDIOMAS[codigo] || codigo?.toUpperCase() || '';
}

// Adjetivo usado nos motivos ("produções coreanas")
const ADJETIVOS = {
  pt: 'brasileiras', en: 'americanas ou britânicas', es: 'espanholas e latinas', ko: 'coreanas',
  ja: 'japonesas', zh: 'chinesas', fr: 'francesas', de: 'alemãs', it: 'italianas', sv: 'suecas',
  da: 'dinamarquesas', no: 'norueguesas', nl: 'holandesas', pl: 'polonesas', tr: 'turcas',
  hi: 'indianas', th: 'tailandesas',
};

export function adjetivoIdioma(codigo) {
  return ADJETIVOS[codigo] || `em ${nomeIdioma(codigo).toLowerCase()}`;
}
