import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '../../../../shared/ui/States.jsx';
import FilterForm from '../../components/FilterForm.jsx';
import MoodPicker from '../../components/MoodPicker.jsx';
import { MovieGrid } from '../../components/MovieCard.jsx';
import { cmApi } from '../../lib/api.js';
import { dataCurta } from '../../lib/format.js';
import { useDashboard } from './DashboardContext.js';
import SearchResults, { aplicarMudanca } from './SearchResults.jsx';

// Lembra o humor escolhido (só neste navegador; se não der para salvar, tudo bem)
const CHAVE_HUMOR = 'cinematch:humor';
const lerHumor = () => {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_HUMOR)) || { tempo: null, clima: null };
  } catch {
    return { tempo: null, clima: null };
  }
};

export default function ParaVoce() {
  const { marcar, abrirDetalhes, ouvirMudancas } = useDashboard();
  const [humor, setHumor] = useState(lerHumor);
  const [estado, setEstado] = useState({ carregando: true });
  const [painelFiltros, setPainelFiltros] = useState(false);
  const [busca, setBusca] = useState(null); // resultados do painel de filtros

  const carregar = useCallback(
    (forcar = false) => {
      setEstado((e) => ({ ...e, carregando: true, erro: null }));
      cmApi
        .recomendacoes({ humor: humor.clima, tempo: humor.tempo, forcar })
        .then((dados) => setEstado({ dados }))
        .catch((e) => setEstado({ erro: e.message, semPerfil: e.status === 404 }));
    },
    [humor]
  );

  useEffect(() => carregar(), [carregar]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE_HUMOR, JSON.stringify(humor));
    } catch {
      /* ignora */
    }
  }, [humor]);

  // Título marcado (aqui ou no modal de detalhes): atualiza as listas na hora
  useEffect(
    () =>
      ouvirMudancas((titulo, status) => {
        setEstado((e) => (e.dados ? { ...e, dados: { ...e.dados, itens: aplicarMudanca(e.dados.itens, titulo, status) } } : e));
        setBusca((b) => (b?.dados ? { ...b, dados: { ...b.dados, itens: aplicarMudanca(b.dados.itens, titulo, status) } } : b));
      }),
    [ouvirMudancas]
  );

  const pesquisar = (filtros, texto) => {
    setBusca({ carregando: true, filtros, texto });
    cmApi
      .pesquisar(filtros, texto)
      .then((dados) => setBusca({ dados, filtros, texto }))
      .catch((e) => setBusca({ erro: e.message, filtros, texto }));
  };

  const itens = estado.dados?.itens || [];
  const restantes = itens.length;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl tracking-wide">Para você</h1>
          <p className="text-sm text-cine-muted">
            Só títulos verificados na Netflix Brasil
            {estado.dados?.gerado_em ? ` · atualizado em ${dataCurta(estado.dados.gerado_em)}` : ''}
          </p>
        </div>
        <button className="btn-secundario" onClick={() => carregar(true)} disabled={estado.carregando}>
          🔄 Atualizar recomendações
        </button>
      </header>

      <MoodPicker tempo={humor.tempo} clima={humor.clima} onChange={setHumor} />

      {/* Painel de filtros recolhível */}
      <div className="cartao">
        <button className="flex w-full items-center justify-between px-5 py-3.5 text-left font-medium" aria-expanded={painelFiltros} onClick={() => setPainelFiltros((p) => !p)}>
          <span>🎛️ Refinar com filtros</span>
          <span className={`text-cine-muted transition ${painelFiltros ? 'rotate-180' : ''}`}>⌄</span>
        </button>
        {painelFiltros && (
          <div className="border-t border-cine-border/60 p-5">
            <FilterForm valorInicial={busca?.filtros} textoInicial={busca?.texto || ''} onPesquisar={pesquisar} carregando={busca?.carregando} />
          </div>
        )}
      </div>

      {busca ? (
        <div className="space-y-4">
          <button className="btn-fantasma -ml-3" onClick={() => setBusca(null)}>
            ← Voltar para as recomendações
          </button>
          <SearchResults estado={busca} onTentar={() => pesquisar(busca.filtros, busca.texto)} />
        </div>
      ) : estado.erro ? (
        estado.semPerfil ? (
          <EmptyState icone="🧬" titulo="Você ainda não tem um perfil de gosto" acao={<Link to="/cinematch/inicio" className="btn-primario">Criar meu perfil</Link>}>
            Faça o quiz ou importe seu histórico da Netflix para receber recomendações.
          </EmptyState>
        ) : (
          <ErrorState mensagem={estado.erro} onTentar={() => carregar()} />
        )
      ) : estado.carregando && !restantes ? (
        <>
          <p className="animate-pulse text-sm text-cine-muted">Montando seu catálogo e verificando cada título na Netflix Brasil… (a primeira vez pode levar uns segundos)</p>
          <MovieGrid carregando />
        </>
      ) : (
        <>
          {estado.dados?.aviso && <p className="rounded-xl bg-cine-surface-2 px-4 py-2.5 text-sm text-cine-muted">ℹ️ {estado.dados.aviso}</p>}
          {!restantes ? (
            <EmptyState titulo="Você zerou as recomendações! 🎉" acao={<button className="btn-primario" onClick={() => carregar(true)}>Buscar mais</button>}>
              Clique para gerar uma nova leva com base no seu perfil atualizado.
            </EmptyState>
          ) : (
            <div className={estado.carregando ? 'pointer-events-none opacity-50 transition' : 'transition'}>
              <MovieGrid itens={itens} onMarcar={marcar} onDetalhes={abrirDetalhes} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
