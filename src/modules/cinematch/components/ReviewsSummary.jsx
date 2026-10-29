import { useEffect, useState } from 'react';
import { cmApi } from '../lib/api.js';

// "O que o público diz": resumo das resenhas REAIS do TMDB (nunca inventadas).
// Carrega só quando for aberto, para economizar chamadas à IA.
export default function ReviewsSummary({ tipo, id, abertoInicial = false }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [estado, setEstado] = useState({ carregando: false });

  useEffect(() => {
    if (!aberto || estado.dados || estado.carregando) return;
    setEstado({ carregando: true });
    cmApi
      .resenhas(tipo, id)
      .then((dados) => setEstado({ dados }))
      .catch((e) => setEstado({ erro: e.message }));
  }, [aberto, tipo, id, estado.dados, estado.carregando]);

  return (
    <div className="rounded-xl border border-cine-border/70" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm font-medium"
      >
        <span>💬 O que o público diz</span>
        <span className={`text-cine-muted transition ${aberto ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {aberto && (
        <div className="border-t border-cine-border/70 px-3.5 py-3 text-sm">
          {estado.carregando && (
            <div className="space-y-2">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-4/5" />
            </div>
          )}
          {estado.erro && <p className="text-red-300">{estado.erro}</p>}
          {estado.dados && <Conteudo dados={estado.dados} />}
        </div>
      )}
    </div>
  );
}

function Conteudo({ dados }) {
  if (!dados.total) return <p className="text-cine-muted">{dados.mensagem || 'Ainda não há resenhas de usuários para este título.'}</p>;
  return (
    <div className="space-y-3">
      {dados.resumo ? (
        <p className="leading-relaxed text-cine-text/90">{dados.resumo}</p>
      ) : (
        <>
          <p className="text-xs text-cine-muted">Trechos das resenhas originais (em inglês, na maioria):</p>
          {dados.trechos.map((t, i) => (
            <blockquote key={i} className="border-l-2 border-cine-border pl-3 text-cine-text/80">
              “{t.texto}”
              <footer className="mt-1 text-xs text-cine-muted">
                {t.autor}
                {t.nota ? ` · ${t.nota}/10` : ''}
              </footer>
            </blockquote>
          ))}
        </>
      )}
      <a href={dados.link} target="_blank" rel="noreferrer" className="inline-block text-xs text-cine-accent hover:underline">
        Ler as {dados.total} resenha{dados.total > 1 ? 's' : ''} originais no TMDB ↗
      </a>
    </div>
  );
}
