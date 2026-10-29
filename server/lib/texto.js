// Normaliza nomes para comparar: minúsculas, sem acentos e sem pontuação
// ("O Fabuloso Destino de Amélie Poulain" -> "o fabuloso destino de amelie poulain")
export function normalizarNome(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function nomesDoResultado(r) {
  return [r.title, r.name, r.original_title, r.original_name].filter(Boolean).map(normalizarNome);
}

export function anoDoResultado(r) {
  return parseInt(String(r.release_date || r.first_air_date || '').slice(0, 4), 10) || null;
}
