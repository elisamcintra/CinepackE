import { useEffect, useState } from 'react';
import Modal from '../../../shared/ui/Modal.jsx';
import Spinner from '../../../shared/ui/Spinner.jsx';
import { ErrorState } from '../../../shared/ui/States.jsx';
import { cmApi } from '../lib/api.js';
import { backdropUrl, duracaoTexto, posterUrl } from '../lib/format.js';
import { NotInterestedDialog, RateDialog } from './ActionDialogs.jsx';
import { Compatibilidade, TemasEmComum } from './MovieCard.jsx';
import { BotaoNetflix, NetflixBadge } from './NetflixBadge.jsx';
import Poster from './Poster.jsx';
import Ratings from './Ratings.jsx';
import ReviewsSummary from './ReviewsSummary.jsx';
import Rastreamento from './Rastreamento.jsx';
import TrailerModal from './TrailerModal.jsx';

// Página de detalhes (em modal): elenco, diretor, todas as notas e resenhas.
// `resumo` é o que já temos do card (mostrado na hora); o resto carrega do servidor.
export default function TitleDetailsModal({ resumo, onFechar, onMarcar }) {
  const [estado, setEstado] = useState({ carregando: true });
  const [dialogo, setDialogo] = useState(null);
  const [trailer, setTrailer] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!resumo) return;
    let ativo = true;
    setEstado({ carregando: true });
    cmApi
      .titulo(resumo.tipo, resumo.tmdb_id)
      .then((d) => ativo && setEstado({ dados: d }))
      .catch((e) => ativo && setEstado({ erro: e.message }));
    return () => {
      ativo = false;
    };
  }, [resumo, tentativa]);

  if (!resumo) return null;
  const t = { ...resumo, ...(estado.dados || {}), motivo: resumo.motivo, motivo_por: resumo.motivo_por };
  const status = t.status_usuario;

  const marcar = async (payload) => {
    setDialogo(null);
    const ok = await onMarcar(t, payload);
    if (ok && payload.status !== 'quero_ver' && payload.status !== null) onFechar();
    else if (ok) setEstado((e) => ({ ...e, dados: { ...e.dados, status_usuario: payload.status } }));
  };

  return (
    <Modal aberto onFechar={onFechar} titulo={t.titulo} largura="max-w-3xl" semPadding>
      {/* Cabeçalho com imagem de fundo */}
      <div className="relative">
        {t.backdrop_path && (
          <img src={backdropUrl(t.backdrop_path)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-cine-surface via-cine-surface/80 to-transparent" />
        <div className="relative flex gap-5 p-6 pt-10">
          <div className="w-28 shrink-0 overflow-hidden rounded-xl shadow-xl sm:w-36">
            <Poster path={t.poster_path} titulo={t.titulo} />
          </div>
          <div className="min-w-0 self-end">
            <h2 className="font-display text-3xl leading-none tracking-wide sm:text-4xl">{t.titulo}</h2>
            {t.titulo_original && t.titulo_original !== t.titulo && <p className="mt-1 text-sm italic text-cine-muted">{t.titulo_original}</p>}
            <p className="mt-2 text-sm text-cine-muted">
              {[
                t.ano,
                t.tipo === 'tv' ? 'Série' : 'Filme',
                t.tipo === 'tv'
                  ? [t.temporadas && `${t.temporadas} temporada${t.temporadas > 1 ? 's' : ''}`, t.episodios && `${t.episodios} episódios`].filter(Boolean).join(', ')
                  : duracaoTexto(t.duracao),
                t.classificacao && `Classificação ${t.classificacao}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="mt-3">
              <NetflixBadge netflix={t.netflix} />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-6 pb-6">
        {estado.erro && <ErrorState mensagem={estado.erro} onTentar={() => setTentativa((n) => n + 1)} />}

        {t.motivo && (
          <div className="flex items-start gap-4 rounded-xl border-l-4 border-cine-accent bg-cine-accent/10 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cine-accent">Por que pra você</p>
              <p className="mt-0.5 text-sm">{t.motivo}</p>
              <TemasEmComum temas={resumo.temas_em_comum} />
            </div>
            <Compatibilidade valor={resumo.compatibilidade} grande />
          </div>
        )}
        {resumo.rastreamento && <Rastreamento r={resumo.rastreamento} />}

        <div className="flex flex-wrap gap-2">
          <BotaoNetflix titulo={t.titulo} />
          {t.trailer_key && (
            <button className="btn-secundario py-2 text-sm" onClick={() => setTrailer(true)}>
              🎞️ Ver trailer
            </button>
          )}
        </div>

        {!!t.generos?.length && (
          <ul className="flex flex-wrap gap-1.5">
            {t.generos.map((g) => (
              <li key={g.id} className="rounded-full bg-cine-surface-2 px-2.5 py-0.5 text-xs text-cine-muted">
                {g.nome}
              </li>
            ))}
          </ul>
        )}

        {t.sinopse && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-cine-muted">Sinopse {t.sinopse_original && '(original, em inglês)'}</h3>
            <p className="leading-relaxed text-cine-text/90">{t.sinopse}</p>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-cine-muted">Notas</h3>
          {estado.carregando ? <Spinner className="h-5 w-5" /> : <Ratings titulo={t} />}
        </section>

        {estado.dados && (
          <>
            {!!t.diretores?.length && (
              <p className="text-sm">
                <span className="text-cine-muted">{t.tipo === 'tv' ? 'Criação: ' : 'Direção: '}</span>
                {t.diretores.join(', ')}
              </p>
            )}
            {!!t.elenco?.length && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-cine-muted">Elenco</h3>
                <ul className="sem-scrollbar -mx-6 flex gap-3 overflow-x-auto px-6 pb-1">
                  {t.elenco.map((p) => (
                    <li key={p.nome + p.personagem} className="w-20 shrink-0 text-center">
                      <div className="mx-auto h-20 w-20 overflow-hidden rounded-full bg-cine-surface-2">
                        {p.foto ? (
                          <img src={posterUrl(p.foto, 'w185')} alt={p.nome} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="grid h-full place-items-center text-2xl text-cine-muted">👤</span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs font-medium">{p.nome}</p>
                      <p className="line-clamp-1 text-[11px] text-cine-muted">{p.personagem}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <ReviewsSummary tipo={t.tipo} id={t.tmdb_id} abertoInicial />

        <div className="grid grid-cols-3 gap-2 border-t border-cine-border/60 pt-4">
          <button className={`btn-secundario text-sm ${status === 'ja_vi' ? 'border-cine-ok text-green-300' : ''}`} onClick={() => setDialogo('nota')}>
            ✅ Já vi
          </button>
          <button
            className={`btn-secundario text-sm ${status === 'quero_ver' ? 'border-cine-accent text-cine-accent-strong' : ''}`}
            onClick={() => marcar({ status: status === 'quero_ver' ? null : 'quero_ver' })}
          >
            🔖 {status === 'quero_ver' ? 'Na lista' : 'Quero ver'}
          </button>
          <button className="btn-secundario text-sm" onClick={() => setDialogo('nao')}>
            🚫 Não me interessa
          </button>
        </div>
      </div>

      {dialogo === 'nota' && <RateDialog titulo={t} onFechar={() => setDialogo(null)} onConfirmar={(nota) => marcar({ status: 'ja_vi', nota })} />}
      {dialogo === 'nao' && (
        <NotInterestedDialog titulo={t} onFechar={() => setDialogo(null)} onConfirmar={(motivo) => marcar({ status: 'nao_interessa', motivo })} />
      )}
      {trailer && <TrailerModal videoKey={t.trailer_key} titulo={t.titulo} onFechar={() => setTrailer(false)} />}
    </Modal>
  );
}
