import { useState } from 'react';
import { duracaoTexto } from '../lib/format.js';
import { NotInterestedDialog, RateDialog } from './ActionDialogs.jsx';
import { BotaoNetflix, NetflixBadge } from './NetflixBadge.jsx';
import Poster from './Poster.jsx';
import Ratings from './Ratings.jsx';
import ReviewsSummary from './ReviewsSummary.jsx';
import TrailerModal from './TrailerModal.jsx';

// Card completo de um filme/série no catálogo.
//   onMarcar(titulo, { status, nota, motivo })  -> Já vi / Quero ver / Não me interessa
//   onDetalhes(titulo)                           -> abre a página de detalhes
export default function MovieCard({ titulo: t, onMarcar, onDetalhes }) {
  const [dialogo, setDialogo] = useState(null); // 'nota' | 'nao' | null
  const [trailer, setTrailer] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const naLista = t.status_usuario === 'quero_ver';

  const marcar = async (payload) => {
    setDialogo(null);
    setOcupado(true);
    await onMarcar(t, payload);
    setOcupado(false);
  };

  const meta = [
    t.ano,
    t.tipo === 'tv' ? 'Série' : 'Filme',
    t.tipo === 'tv' ? (t.temporadas ? `${t.temporadas} temporada${t.temporadas > 1 ? 's' : ''}` : null) : duracaoTexto(t.duracao),
  ].filter(Boolean);

  return (
    <article className={`cartao group flex flex-col overflow-hidden transition hover:border-cine-muted/60 sm:flex-row ${ocupado ? 'opacity-60' : ''}`}>
      {/* Pôster */}
      <button
        onClick={() => onDetalhes?.(t)}
        className="relative shrink-0 overflow-hidden sm:w-44 md:w-48"
        aria-label={`Ver detalhes de ${t.titulo}`}
      >
        <Poster path={t.poster_path} titulo={t.titulo} className="transition duration-300 group-hover:scale-[1.03] max-sm:aspect-[16/10] max-sm:object-[center_20%]" />
      </button>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <header>
          <div className="flex items-start justify-between gap-3">
            <button onClick={() => onDetalhes?.(t)} className="text-left">
              <h3 className="text-lg font-semibold leading-tight hover:text-cine-accent-strong">{t.titulo}</h3>
            </button>
            <Compatibilidade valor={t.compatibilidade} />
          </div>
          {t.titulo_original && t.titulo_original !== t.titulo && (
            <p className="text-xs italic text-cine-muted">{t.titulo_original}</p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-cine-muted">
            {meta.join(' · ')}
            {t.classificacao && (
              <span className="rounded border border-cine-border px-1.5 text-[11px] font-semibold text-cine-text">{t.classificacao}</span>
            )}
          </p>
          {!!t.generos?.length && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {t.generos.slice(0, 4).map((g) => (
                <li key={g.id} className="rounded-full bg-cine-surface-2 px-2.5 py-0.5 text-xs text-cine-muted">
                  {g.nome}
                </li>
              ))}
            </ul>
          )}
        </header>

        {t.motivo && (
          <div className="rounded-xl border-l-4 border-cine-accent bg-cine-accent/10 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-cine-accent">
              Por que pra você {t.motivo_por === 'ia' && <span title="Explicação gerada por IA">✨</span>}
            </p>
            <p className="mt-0.5 text-sm text-cine-text">{t.motivo}</p>
            <TemasEmComum temas={t.temas_em_comum} />
          </div>
        )}

        {t.sinopse && (
          <div>
            <p className="line-clamp-4 text-sm leading-relaxed text-cine-text/80">{t.sinopse}</p>
            {t.sinopse_original && <p className="mt-1 text-[11px] text-cine-muted">(sinopse original, em inglês)</p>}
          </div>
        )}

        <Ratings titulo={t} compacto />

        <ReviewsSummary tipo={t.tipo} id={t.tmdb_id} />

        <div className="flex flex-wrap items-center gap-2">
          <NetflixBadge netflix={t.netflix} />
        </div>
        <div className="flex flex-wrap gap-2">
          <BotaoNetflix titulo={t.titulo} />
          {t.trailer_key && (
            <button className="btn-secundario py-2 text-sm" onClick={() => setTrailer(true)}>
              🎞️ Trailer
            </button>
          )}
        </div>

        {/* Ações */}
        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-cine-border/60 pt-3">
          <button className="btn-fantasma flex-col gap-0.5 sm:flex-row" disabled={ocupado} onClick={() => setDialogo('nota')}>
            ✅ <span>Já vi</span>
          </button>
          <button
            className={`btn-fantasma flex-col gap-0.5 sm:flex-row ${naLista ? 'bg-cine-accent/10 text-cine-accent-strong' : ''}`}
            disabled={ocupado}
            aria-pressed={naLista}
            onClick={() => marcar({ status: naLista ? null : 'quero_ver' })}
          >
            🔖 <span>{naLista ? 'Na lista' : 'Quero ver'}</span>
          </button>
          <button className="btn-fantasma flex-col gap-0.5 sm:flex-row" disabled={ocupado} onClick={() => setDialogo('nao')}>
            🚫 <span className="text-center leading-tight">Não me interessa</span>
          </button>
        </div>
      </div>

      {dialogo === 'nota' && (
        <RateDialog titulo={t} onFechar={() => setDialogo(null)} onConfirmar={(nota) => marcar({ status: 'ja_vi', nota })} />
      )}
      {dialogo === 'nao' && (
        <NotInterestedDialog titulo={t} onFechar={() => setDialogo(null)} onConfirmar={(motivo) => marcar({ status: 'nao_interessa', motivo })} />
      )}
      {trailer && <TrailerModal videoKey={t.trailer_key} titulo={t.titulo} onFechar={() => setTrailer(false)} />}
    </article>
  );
}

// Selo "87% compatível": anel que preenche conforme a compatibilidade com o perfil
export function Compatibilidade({ valor, grande = false }) {
  if (valor == null) return null;
  const tamanho = grande ? 56 : 44;
  const raio = tamanho / 2 - 4;
  const circ = 2 * Math.PI * raio;
  return (
    <div className="flex shrink-0 flex-col items-center" title={`${valor}% compatível com o seu perfil de gosto`}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label={`${valor}% compatível`}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" stroke="var(--color-cine-surface-2)" strokeWidth="4" />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke="var(--color-cine-accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(valor / 100) * circ} ${circ}`}
          transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-cine-text text-[12px] font-bold" style={grande ? { fontSize: 15 } : undefined}>
          {valor}%
        </text>
      </svg>
      <span className="mt-0.5 text-[10px] uppercase tracking-wide text-cine-muted">match</span>
    </div>
  );
}

// Detalhes que o título tem em comum com os favoritos da pessoa
export function TemasEmComum({ temas }) {
  if (!temas?.length) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-cine-muted">
      Em comum com seus favoritos:
      {temas.slice(0, 3).map((t) => (
        <span key={t} className="rounded-full border border-cine-accent/30 px-2 py-0.5 text-cine-accent-strong">
          {t}
        </span>
      ))}
    </p>
  );
}

// Esqueleto exibido enquanto o catálogo carrega
export function MovieCardSkeleton() {
  return (
    <div className="cartao flex flex-col overflow-hidden sm:flex-row" aria-hidden>
      <div className="skeleton aspect-[16/10] rounded-none sm:aspect-[2/3] sm:w-44 md:w-48" />
      <div className="flex-1 space-y-3 p-4">
        <div className="skeleton h-5 w-2/3" />
        <div className="skeleton h-3 w-1/3" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
        <div className="skeleton h-9 w-1/2" />
      </div>
    </div>
  );
}

export function MovieGrid({ itens, carregando, onMarcar, onDetalhes, quantidadeSkeleton = 6 }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {carregando
        ? Array.from({ length: quantidadeSkeleton }, (_, i) => <MovieCardSkeleton key={i} />)
        : itens.map((t) => <MovieCard key={`${t.tipo}:${t.tmdb_id}`} titulo={t} onMarcar={onMarcar} onDetalhes={onDetalhes} />)}
    </div>
  );
}
