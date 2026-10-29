import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { temPerfil } from '../lib/profile.js';

// Home de escolha: os 3 caminhos para descobrir o gosto do usuário
const CAMINHOS = [
  {
    to: '/cinematch/historico',
    icone: '📜',
    titulo: 'Descubra o que assistir pelo histórico da Netflix',
    subtitulo: 'Use o que você já assistiu. Leva 1 minuto.',
  },
  {
    to: '/cinematch/quiz',
    icone: '🎯',
    titulo: 'Descubra o que assistir pelo quiz',
    subtitulo: '10 perguntas sobre o seu gosto de verdade.',
  },
  {
    to: '/cinematch/combinado',
    icone: '✨',
    titulo: 'Histórico + Quiz (recomendação mais precisa)',
    subtitulo: 'Combine os dois para resultados certeiros.',
    recomendado: true,
  },
];

export default function Escolha() {
  const [jaTemPerfil, setJaTemPerfil] = useState(false);
  useEffect(() => {
    temPerfil().then(setJaTemPerfil).catch(() => {});
  }, []);

  return (
    <section className="py-4">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-5xl tracking-wide sm:text-6xl">Como você quer começar?</h1>
        <p className="mt-3 text-cine-muted">
          Tudo alimenta o mesmo perfil de gosto. Depois você pode fazer os outros caminhos pelo painel.
        </p>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {CAMINHOS.map((c, i) => (
          <Link
            key={c.to}
            to={c.to}
            style={{ animationDelay: `${i * 80}ms` }}
            className={`group relative flex animate-[subir_.4s_ease-out_both] flex-col rounded-3xl border p-7 transition hover:-translate-y-1 ${
              c.recomendado
                ? 'border-cine-accent bg-gradient-to-b from-cine-accent/15 to-cine-surface shadow-[0_0_40px_-12px_var(--color-cine-accent)]'
                : 'border-cine-border bg-cine-surface hover:border-cine-muted'
            }`}
          >
            {c.recomendado && (
              <span className="absolute -top-3 left-7 rounded-full bg-cine-accent px-3 py-1 text-xs font-bold uppercase tracking-wider text-black">
                Recomendado
              </span>
            )}
            <span className="text-5xl" aria-hidden>
              {c.icone}
            </span>
            <h2 className="mt-5 text-xl font-semibold leading-snug">{c.titulo}</h2>
            <p className="mt-2 text-cine-muted">{c.subtitulo}</p>
            <span className="mt-auto pt-6 font-medium text-cine-accent transition group-hover:translate-x-1">Começar →</span>
          </Link>
        ))}
      </div>

      {jaTemPerfil && (
        <p className="mt-10 text-center">
          <Link to="/cinematch/app/para-voce" className="btn-secundario">
            Ir para minhas recomendações
          </Link>
        </p>
      )}
    </section>
  );
}
