// Todas as chamadas do CineMatch ao nosso backend, num lugar só.
import { api } from '../../../shared/lib/apiClient.js';

const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, v === true ? '1' : v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const cmApi = {
  buscarTitulos: (q, signal) => api(`/api/tmdb/search${qs({ q })}`, { signal }),
  generos: () => api('/api/tmdb/genres'),

  identificarLote: (titulos) => api('/api/import/netflix-csv', { method: 'POST', body: { titulos } }),
  salvarImportacao: (itens) => api('/api/import/save', { method: 'POST', body: { itens } }),
  finalizarImportacao: (titulosOriginais) => api('/api/import/finalizar', { method: 'POST', body: { titulos_originais: titulosOriginais } }),

  perfil: () => api('/api/profile'),
  gerarPerfil: () => api('/api/profile/generate', { method: 'POST' }),
  baseMovielens: () => api('/api/profile/movielens'),
  temas: () => api('/api/profile/temas'),
  salvarTemas: (ids) => api('/api/profile/temas', { method: 'PUT', body: { ids } }),

  recomendacoes: ({ humor, tempo, forcar } = {}) => api(`/api/recommendations${qs({ humor, tempo, forcar })}`),
  pesquisar: (filtros, texto) => api('/api/search', { method: 'POST', body: { filtros, texto } }),

  titulo: (tipo, id) => api(`/api/title/${tipo}/${id}`),
  resenhas: (tipo, id) => api(`/api/title/${tipo}/${id}/reviews`),

  listar: (status) => api(`/api/user-titles${qs({ status })}`),
  marcar: (item) => api('/api/user-titles', { method: 'POST', body: item }),
  marcarLote: (itens) => api('/api/user-titles/lote', { method: 'POST', body: { itens } }),
  desmarcar: (tipo, id) => api(`/api/user-titles/${tipo}/${id}`, { method: 'DELETE' }),
};

// Dados mínimos de um título guardados junto com Já vi / Quero ver (para as listas)
export function dadosDoTitulo(t) {
  return {
    titulo: t.titulo,
    titulo_original: t.titulo_original,
    poster_path: t.poster_path,
    ano: t.ano,
    genre_ids: t.genre_ids || (t.generos || []).map((g) => g.id),
    idioma_original: t.idioma_original,
    nota_tmdb: t.nota_tmdb,
  };
}
