import { useCallback, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, useParams } from 'react-router';
import TitleDetailsModal from '../../components/TitleDetailsModal.jsx';
import { useMarcarTitulo } from '../../lib/useMarcarTitulo.js';
import { DashboardContext } from './DashboardContext.js';
import MeuGosto from './MeuGosto.jsx';
import MinhaLista from './MinhaLista.jsx';
import ParaVoce from './ParaVoce.jsx';
import Pesquisar from './Pesquisar.jsx';

const ABAS = [
  { id: 'para-voce', icone: '🎬', nome: 'Para você', Componente: ParaVoce },
  { id: 'pesquisar', icone: '🔍', nome: 'Pesquisar', Componente: Pesquisar },
  { id: 'quero-ver', icone: '🔖', nome: 'Quero ver', Componente: () => <MinhaLista status="quero_ver" /> },
  { id: 'ja-vi', icone: '✅', nome: 'Já vi', Componente: () => <MinhaLista status="ja_vi" /> },
  { id: 'meu-gosto', icone: '🧬', nome: 'Meu gosto', Componente: MeuGosto },
];

export default function Dashboard() {
  const { aba = 'para-voce' } = useParams();
  const [detalhe, setDetalhe] = useState(null);
  const ouvintes = useRef(new Set());

  // Quando um título muda de status (em qualquer lugar), todas as abas abertas ficam sabendo
  const avisar = useCallback((titulo, status, extra) => {
    ouvintes.current.forEach((fn) => fn(titulo, status, extra));
  }, []);
  const marcar = useMarcarTitulo(avisar);

  const contexto = useMemo(
    () => ({
      abrirDetalhes: setDetalhe,
      marcar,
      ouvirMudancas: (fn) => {
        ouvintes.current.add(fn);
        return () => ouvintes.current.delete(fn);
      },
    }),
    [marcar]
  );

  const atual = ABAS.find((a) => a.id === aba);
  if (!atual) return <Navigate to="/cinematch/app/para-voce" replace />;
  const { Componente } = atual;

  return (
    <DashboardContext.Provider value={contexto}>
      <div className="md:grid md:grid-cols-[200px_1fr] md:gap-8">
        {/* Menu: lateral no computador, abas roláveis no celular */}
        <nav aria-label="Seções" className="sem-scrollbar sticky top-14 z-10 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-cine-border/60 bg-cine-bg/90 px-4 py-2 backdrop-blur md:top-20 md:mx-0 md:mb-0 md:flex-col md:self-start md:border-0 md:bg-transparent md:p-0">
          {ABAS.map((a) => (
            <NavLink
              key={a.id}
              to={`/cinematch/app/${a.id}`}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-cine-accent/15 text-cine-accent-strong' : 'text-cine-muted hover:bg-cine-surface-2 hover:text-cine-text'
                }`
              }
            >
              <span aria-hidden>{a.icone}</span>
              {a.nome}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0">
          <Componente key={aba} />
        </div>
      </div>

      {detalhe && <TitleDetailsModal resumo={detalhe} onFechar={() => setDetalhe(null)} onMarcar={marcar} />}
    </DashboardContext.Provider>
  );
}
