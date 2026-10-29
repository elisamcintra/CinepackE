import { EmptyState, ErrorState } from '../../../../shared/ui/States.jsx';
import { MovieGrid } from '../../components/MovieCard.jsx';
import { useDashboard } from './DashboardContext.js';

// Lista de resultados de pesquisa (usada na aba Pesquisar e no painel de filtros do "Para você")
export default function SearchResults({ estado, onTentar }) {
  const { marcar, abrirDetalhes } = useDashboard();

  if (estado.erro) return <ErrorState mensagem={estado.erro} onTentar={onTentar} />;
  if (estado.carregando) {
    return (
      <>
        <p className="mb-4 animate-pulse text-sm text-cine-muted">Buscando e verificando cada título na Netflix Brasil…</p>
        <MovieGrid carregando quantidadeSkeleton={4} />
      </>
    );
  }
  if (!estado.dados) return null;

  const { itens, interpretacao, aviso } = estado.dados;
  return (
    <div className="space-y-4">
      {interpretacao?.explicacao && (
        <p className="rounded-xl bg-cine-surface-2 px-4 py-2.5 text-sm text-cine-muted">
          {interpretacao.por === 'ia' ? '✨ ' : ''}
          {interpretacao.explicacao}
        </p>
      )}
      {!itens.length ? (
        <EmptyState icone="🔎" titulo="Nenhum resultado com esses filtros">
          {aviso || 'Tente afrouxar a duração, o ano ou a nota mínima.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-cine-muted">
            {itens.length} título{itens.length > 1 ? 's' : ''} verificado{itens.length > 1 ? 's' : ''} na Netflix Brasil
            {aviso ? ` · ${aviso}` : ''}
          </p>
          <MovieGrid itens={itens} onMarcar={marcar} onDetalhes={abrirDetalhes} />
        </>
      )}
    </div>
  );
}

// Atualiza a lista de resultados quando um título é marcado
export function aplicarMudanca(itens, titulo, status) {
  const mesmo = (t) => t.tipo === titulo.tipo && t.tmdb_id === titulo.tmdb_id;
  if (status === 'ja_vi' || status === 'nao_interessa') return itens.filter((t) => !mesmo(t));
  return itens.map((t) => (mesmo(t) ? { ...t, status_usuario: status } : t));
}
