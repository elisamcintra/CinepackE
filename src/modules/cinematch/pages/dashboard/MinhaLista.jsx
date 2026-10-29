import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '../../../../shared/ui/States.jsx';
import { RateDialog } from '../../components/ActionDialogs.jsx';
import Poster from '../../components/Poster.jsx';
import RatingStars from '../../components/RatingStars.jsx';
import { cmApi } from '../../lib/api.js';
import { useDashboard } from './DashboardContext.js';

// Abas "Quero ver" e "Já vi" (com notas editáveis)
export default function MinhaLista({ status }) {
  const { marcar, abrirDetalhes, ouvirMudancas } = useDashboard();
  const [estado, setEstado] = useState({ carregando: true });
  const [filtro, setFiltro] = useState('');
  const [somenteAvaliados, setSomenteAvaliados] = useState(false);
  const [limite, setLimite] = useState(60);
  const [avaliando, setAvaliando] = useState(null);
  const jaVi = status === 'ja_vi';

  const carregar = () => {
    setEstado({ carregando: true });
    cmApi
      .listar(status)
      .then(({ itens }) => setEstado({ itens: itens.map((i) => ({ ...i.dados, tmdb_id: i.tmdb_id, tipo: i.tipo, nota: i.nota, origem: i.origem })) }))
      .catch((e) => setEstado({ erro: e.message }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(carregar, [status]);

  // Mantém a lista em dia quando algo é marcado no modal de detalhes
  useEffect(
    () =>
      ouvirMudancas((titulo, novoStatus, extra) =>
        setEstado((e) => {
          if (!e.itens) return e;
          const mesmo = (t) => t.tipo === titulo.tipo && t.tmdb_id === titulo.tmdb_id;
          if (novoStatus !== status) return { ...e, itens: e.itens.filter((t) => !mesmo(t)) };
          if (e.itens.some(mesmo)) return { ...e, itens: e.itens.map((t) => (mesmo(t) ? { ...t, nota: extra?.nota ?? t.nota } : t)) };
          return { ...e, itens: [{ ...titulo, nota: extra?.nota ?? null }, ...e.itens] };
        })
      ),
    [ouvirMudancas, status]
  );

  const visiveis = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    return (estado.itens || []).filter((t) => (!termo || (t.titulo || '').toLowerCase().includes(termo)) && (!somenteAvaliados || t.nota));
  }, [estado.itens, filtro, somenteAvaliados]);

  if (estado.erro) return <ErrorState mensagem={estado.erro} onTentar={carregar} />;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl tracking-wide">{jaVi ? 'Já vi' : 'Quero ver'}</h1>
          <p className="text-sm text-cine-muted">
            {estado.itens ? `${estado.itens.length} título${estado.itens.length === 1 ? '' : 's'}` : 'Carregando…'}
            {jaVi && ' · suas notas ajudam a ajustar o seu perfil'}
          </p>
        </div>
        {!!estado.itens?.length && (
          <div className="flex flex-wrap items-center gap-2">
            <input className="campo w-56 py-2" placeholder="Filtrar por nome…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            {jaVi && (
              <button className={`chip ${somenteAvaliados ? 'chip-ativo' : ''}`} onClick={() => setSomenteAvaliados((s) => !s)}>
                ★ Só avaliados
              </button>
            )}
          </div>
        )}
      </header>

      {estado.carregando ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i} className="skeleton aspect-[2/3]" />
          ))}
        </ul>
      ) : !estado.itens.length ? (
        <EmptyState
          icone={jaVi ? '✅' : '🔖'}
          titulo={jaVi ? 'Nada por aqui ainda' : 'Sua lista está vazia'}
          acao={
            <Link to="/cinematch/app/para-voce" className="btn-primario">
              Ver recomendações
            </Link>
          }
        >
          {jaVi ? 'Marque "Já vi" nos cards ou importe seu histórico da Netflix.' : 'Clique em "🔖 Quero ver" nos cards para guardar títulos aqui.'}
        </EmptyState>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {visiveis.slice(0, limite).map((t) => (
              <li key={`${t.tipo}:${t.tmdb_id}`} className="cartao flex flex-col overflow-hidden">
                <button onClick={() => abrirDetalhes(t)} className="block" aria-label={`Ver detalhes de ${t.titulo}`}>
                  <Poster path={t.poster_path} titulo={t.titulo} />
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{t.titulo}</p>
                  <p className="text-xs text-cine-muted">
                    {t.tipo === 'tv' ? 'Série' : 'Filme'}
                    {t.ano ? ` · ${t.ano}` : ''}
                  </p>
                  {jaVi ? (
                    <RatingStars valor={t.nota || 0} tamanho="text-xl" onChange={(nota) => marcar(t, { status: 'ja_vi', nota })} />
                  ) : (
                    <div className="mt-auto flex gap-1">
                      <button className="btn-fantasma flex-1 px-2" onClick={() => setAvaliando(t)}>
                        ✅ Já vi
                      </button>
                      <button className="btn-fantasma px-2" aria-label={`Remover ${t.titulo}`} onClick={() => marcar(t, { status: null })}>
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {visiveis.length > limite && (
            <div className="text-center">
              <button className="btn-secundario" onClick={() => setLimite(limite + 60)}>
                Mostrar mais ({visiveis.length - limite})
              </button>
            </div>
          )}
        </>
      )}

      {avaliando && (
        <RateDialog
          titulo={avaliando}
          onFechar={() => setAvaliando(null)}
          onConfirmar={(nota) => {
            marcar(avaliando, { status: 'ja_vi', nota });
            setAvaliando(null);
          }}
        />
      )}
    </section>
  );
}
