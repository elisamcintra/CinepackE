import { useEffect, useState } from 'react';
import Spinner from '../../../../shared/ui/Spinner.jsx';
import FilterForm from '../../components/FilterForm.jsx';
import { cmApi } from '../../lib/api.js';
import { ultimoFiltro } from '../../lib/profile.js';
import { useDashboard } from './DashboardContext.js';
import SearchResults, { aplicarMudanca } from './SearchResults.jsx';

// Aba "Pesquisar": formulário completo de filtros + texto livre com IA
export default function Pesquisar() {
  const { ouvirMudancas } = useDashboard();
  const [inicial, setInicial] = useState(undefined); // undefined = carregando o último filtro
  const [estado, setEstado] = useState({});

  // Começa com os últimos filtros usados (salvos no perfil)
  useEffect(() => {
    ultimoFiltro()
      .then((u) => setInicial(u || null))
      .catch(() => setInicial(null));
  }, []);

  useEffect(
    () =>
      ouvirMudancas((titulo, status) =>
        setEstado((e) => (e.dados ? { ...e, dados: { ...e.dados, itens: aplicarMudanca(e.dados.itens, titulo, status) } } : e))
      ),
    [ouvirMudancas]
  );

  const pesquisar = (filtros, texto) => {
    setEstado({ carregando: true, filtros, texto });
    cmApi
      .pesquisar(filtros, texto)
      .then((dados) => setEstado({ dados, filtros, texto }))
      .catch((e) => setEstado({ erro: e.message, filtros, texto }));
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-5xl tracking-wide">Pesquisar</h1>
        <p className="text-sm text-cine-muted">Combine filtros ou descreva com suas palavras. Tudo já verificado na Netflix Brasil.</p>
      </header>

      <div className="cartao p-5 sm:p-6">
        {inicial === undefined ? (
          <div className="grid h-40 place-items-center">
            <Spinner />
          </div>
        ) : (
          <FilterForm valorInicial={inicial?.filtros} textoInicial={inicial?.texto || ''} onPesquisar={pesquisar} carregando={estado.carregando} />
        )}
      </div>

      <div aria-live="polite">
        {!estado.carregando && !estado.dados && !estado.erro ? (
          <p className="py-8 text-center text-cine-muted">Escolha os filtros e clique em Pesquisar. 🍿</p>
        ) : (
          <SearchResults estado={estado} onTentar={() => pesquisar(estado.filtros, estado.texto)} />
        )}
      </div>
    </section>
  );
}
