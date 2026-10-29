import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../../shared/lib/apiClient.js';

// Diagnóstico: mostra se o servidor está no ar e quais chaves estão configuradas.
// Útil na primeira configuração (aparece quando o Supabase ainda não foi preenchido).
export default function Configuracao() {
  const [status, setStatus] = useState({ carregando: true });

  const verificar = () => {
    setStatus({ carregando: true });
    api('/api/health')
      .then((data) => setStatus({ ok: true, config: data.config }))
      .catch((e) => setStatus({ erro: e.message }));
  };
  useEffect(verificar, []);

  const navegadorOk = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;
  const itens = status.config && [
    ['Supabase no navegador (.env da raiz)', navegadorOk, 'Obrigatório: login e banco de dados'],
    ['Supabase no servidor (server/.env)', status.config.supabase, 'Obrigatório: SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY'],
    ['TMDB (server/.env)', status.config.tmdb, 'Obrigatório: filmes, séries e verificação da Netflix'],
    ['OMDb (server/.env)', status.config.omdb, 'Opcional: notas do IMDb, Rotten Tomatoes e Metacritic'],
    ['Trakt (server/.env)', status.config.trakt, 'Opcional: séries relacionadas (TRAKT_CLIENT_ID; o Client Secret não é usado)'],
    [`IA: ${status.config.ia.provedor} (server/.env)`, status.config.ia.chaveConfigurada, 'Opcional: sem IA o app usa recomendações por regras'],
    [
      status.config.movielens?.carregado
        ? `MovieLens: carregado (${status.config.movielens.filmes.toLocaleString('pt-BR')} filmes)`
        : 'MovieLens: pendente',
      !!status.config.movielens?.carregado,
      'Opcional: rode "npm run mineracao:baixar" e "npm run mineracao" para ativar a filtragem colaborativa',
    ],
  ];
  const prontoParaEntrar = navegadorOk && status.config?.supabase && status.config?.tmdb;

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-display text-5xl tracking-wide">Configuração</h1>
      <p className="mt-2 text-cine-muted">
        Confira se tudo está pronto. O passo a passo para conseguir cada chave está no arquivo <code className="text-cine-text">README.md</code>.
      </p>

      <div className="cartao mt-8 p-6">
        {status.carregando && <p className="animate-pulse text-cine-muted">Conectando ao servidor…</p>}
        {status.erro && (
          <div>
            <p className="text-cine-danger">❌ {status.erro}</p>
            <p className="mt-2 text-sm text-cine-muted">
              Rode <code>npm run dev</code> na pasta do projeto e confira se aparece "CineMatch API rodando".
            </p>
            <button className="btn-secundario mt-4" onClick={verificar}>
              Verificar de novo
            </button>
          </div>
        )}
        {status.ok && (
          <>
            <p className="font-medium text-cine-ok">✅ Servidor conectado</p>
            <ul className="mt-4 divide-y divide-cine-border/50 text-sm">
              {itens.map(([nome, ok, ajuda]) => (
                <li key={nome} className="flex items-start justify-between gap-4 py-3">
                  <span>
                    {nome}
                    <span className="block text-xs text-cine-muted">{ajuda}</span>
                  </span>
                  <span className={`shrink-0 ${ok ? 'text-cine-ok' : 'text-cine-muted'}`}>{ok ? '✅ configurado' : '⏳ pendente'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-cine-muted">Mudou algum .env? Pare o terminal (Ctrl + C) e rode npm run dev de novo.</p>
          </>
        )}
      </div>

      {prontoParaEntrar && (
        <Link to="/cinematch" className="btn-primario mt-6">
          Tudo certo, entrar no CineMatch →
        </Link>
      )}
    </section>
  );
}
