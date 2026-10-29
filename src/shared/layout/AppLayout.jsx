import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthProvider.jsx';
import Spinner from '../ui/Spinner.jsx';

// Layout genérico do hub: cabeçalho + conteúdo + rodapé.
// Cada módulo (CineMatch e os futuros) passa o próprio nome, links e rodapé.
export default function AppLayout({ title = 'Hub', homePath = '/', footer = null, links = [] }) {
  const { user, sair } = useAuth() || {};

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-cine-border/60 bg-cine-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to={homePath} className="font-display text-2xl tracking-wide text-cine-accent">
            {title}
          </Link>
          {user && (
            <nav className="hidden gap-1 sm:flex" aria-label="Principal">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm transition ${isActive ? 'text-cine-text' : 'text-cine-muted hover:text-cine-text'}`}
                >
                  {l.texto}
                </NavLink>
              ))}
            </nav>
          )}
          {user && <MenuUsuario user={user} sair={sair} links={links} />}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {/* Enquanto uma página carregada sob demanda chega, mostra um indicador */}
        <Suspense
          fallback={
            <div className="grid min-h-[50vh] place-items-center">
              <Spinner />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {footer}
    </div>
  );
}

function MenuUsuario({ user, sair, links }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef(null);
  const nome = user.user_metadata?.full_name || user.user_metadata?.name || user.email;
  const inicial = (nome || '?').trim()[0]?.toUpperCase();

  useEffect(() => {
    const fora = (e) => !caixa.current?.contains(e.target) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  return (
    <div ref={caixa} className="relative ml-auto">
      <button
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-label="Menu da conta"
        className="grid h-9 w-9 place-items-center rounded-full bg-cine-surface-2 font-semibold text-cine-accent ring-1 ring-cine-border hover:ring-cine-muted"
      >
        {inicial}
      </button>
      {aberto && (
        <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-cine-border bg-cine-surface-2 shadow-2xl">
          <p className="truncate border-b border-cine-border px-4 py-3 text-sm text-cine-muted">{user.email}</p>
          {links.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setAberto(false)} className="block px-4 py-2.5 text-sm hover:bg-cine-border/50 sm:hidden">
              {l.texto}
            </Link>
          ))}
          <button onClick={sair} className="block w-full px-4 py-2.5 text-left text-sm text-red-300 hover:bg-cine-border/50">
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
