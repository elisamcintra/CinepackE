import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '../../../shared/auth/AuthProvider.jsx';
import Spinner from '../../../shared/ui/Spinner.jsx';
import { ErrorState } from '../../../shared/ui/States.jsx';
import { useToast } from '../../../shared/ui/Toast.jsx';
import GerandoPerfil from '../components/GerandoPerfil.jsx';
import Poster from '../components/Poster.jsx';
import QuizQuestion, { ExplicarMelhor } from '../components/QuizQuestion.jsx';
import TitleSearch from '../components/TitleSearch.jsx';
import { QUIZ_QUESTIONS, TOTAL_PERGUNTAS } from '../data/quizQuestions.js';
import { cmApi } from '../lib/api.js';
import { carregarRespostas, salvarResposta, titulosAmados } from '../lib/profile.js';

const CHAVE_INDICE = 'cinematch:quiz:indice';
const lerIndice = () => {
  try {
    return Number(localStorage.getItem(CHAVE_INDICE)) || 0;
  } catch {
    return 0;
  }
};
const gravarIndice = (i) => {
  try {
    localStorage.setItem(CHAVE_INDICE, String(i));
  } catch {
    /* navegador sem localStorage: tudo bem, o progresso continua salvo no banco */
  }
};

export default function Quiz() {
  const [params] = useSearchParams();
  const combinado = params.get('modo') === 'combinado';
  const refazer = params.get('refazer') === '1';
  const { user } = useAuth();
  const toast = useToast();

  const [respostas, setRespostas] = useState(null);
  const [indice, setIndice] = useState(0);
  const [erro, setErro] = useState(null);
  const [finalizando, setFinalizando] = useState(false);
  const [sugestoes, setSugestoes] = useState([]);
  const timers = useRef({});
  const pendentes = useRef({});

  // Carrega o que já foi respondido (o quiz continua de onde parou)
  useEffect(() => {
    carregarRespostas()
      .then((r) => {
        setRespostas(r);
        const primeiraSemResposta = QUIZ_QUESTIONS.findIndex((q) => !r[q.id]?.option_ids?.length);
        const salvo = lerIndice();
        if (refazer) setIndice(0);
        else if (primeiraSemResposta === -1) setIndice(Math.min(salvo, TOTAL_PERGUNTAS - 1));
        else setIndice(Math.min(salvo, primeiraSemResposta));
      })
      .catch((e) => setErro(e.message));
    titulosAmados().then(setSugestoes).catch(() => {});
  }, [refazer]);

  useEffect(() => gravarIndice(indice), [indice]);

  // Salva no banco com um pequeno atraso (para não gravar a cada letra digitada)
  const agendarSalvar = useCallback(
    (qid, resp) => {
      pendentes.current[qid] = resp;
      clearTimeout(timers.current[qid]);
      timers.current[qid] = setTimeout(async () => {
        delete pendentes.current[qid];
        try {
          await salvarResposta(user.id, qid, resp);
        } catch (e) {
          toast(`Não consegui salvar sua resposta: ${e.message}`, 'erro');
        }
      }, 500);
    },
    [user, toast]
  );

  const salvarTudoAgora = async () => {
    const lista = Object.entries(pendentes.current);
    for (const [qid] of lista) clearTimeout(timers.current[qid]);
    pendentes.current = {};
    await Promise.all(lista.map(([qid, resp]) => salvarResposta(user.id, Number(qid), resp)));
  };

  const atualizar = (qid, resp) => {
    setRespostas((r) => ({ ...r, [qid]: resp }));
    agendarSalvar(qid, resp);
  };

  if (erro) return <ErrorState mensagem={erro} onTentar={() => window.location.reload()} />;
  if (!respostas) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner />
      </div>
    );
  }
  if (finalizando) return <GerandoPerfil />;

  const pergunta = QUIZ_QUESTIONS[indice];
  const resposta = respostas[pergunta.id] || { option_ids: [], comentario: '' };
  const respondida = resposta.option_ids?.length > 0;
  const ultima = indice === TOTAL_PERGUNTAS - 1;

  const avancar = async () => {
    if (!ultima) {
      setIndice(indice + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    try {
      await salvarTudoAgora();
      gravarIndice(0);
      setFinalizando(true);
    } catch (e) {
      toast(`Não consegui salvar: ${e.message}`, 'erro');
    }
  };

  return (
    <section className="mx-auto max-w-3xl">
      {combinado && (
        <p className="mb-4 inline-block rounded-full bg-cine-accent/15 px-3 py-1 text-xs font-semibold text-cine-accent">
          Passo 2 de 2 · Quiz
        </p>
      )}

      {/* Progresso */}
      <div className="flex items-center justify-between text-sm text-cine-muted">
        <span>
          Pergunta <strong className="text-cine-text">{indice + 1}</strong>/{TOTAL_PERGUNTAS}
        </span>
        <span>{Math.round(((indice + (respondida ? 1 : 0)) / TOTAL_PERGUNTAS) * 100)}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cine-surface-2" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL_PERGUNTAS} aria-valuenow={indice + 1}>
        <div className="h-full rounded-full bg-cine-accent transition-all duration-500" style={{ width: `${((indice + 1) / TOTAL_PERGUNTAS) * 100}%` }} />
      </div>

      <div key={pergunta.id} className="mt-8 animate-[subir_.3s_ease-out]">
        <h1 className="text-2xl font-semibold leading-snug sm:text-3xl">{pergunta.pergunta}</h1>
        {pergunta.ajuda && <p className="mt-2 text-cine-muted">{pergunta.ajuda}</p>}

        <div className="mt-6">
          {pergunta.tipo === 'titulos' ? (
            <PerguntaTitulos pergunta={pergunta} resposta={resposta} sugestoes={sugestoes} onChange={(r) => atualizar(pergunta.id, r)} destacarSugestoes={combinado} />
          ) : (
            <QuizQuestion pergunta={pergunta} resposta={resposta} onChange={(r) => atualizar(pergunta.id, r)} />
          )}
        </div>
      </div>

      {/* Navegação */}
      <div className="sticky bottom-0 -mx-4 mt-10 flex items-center justify-between gap-3 border-t border-cine-border/60 bg-cine-bg/90 px-4 py-4 backdrop-blur">
        <button className="btn-secundario" disabled={indice === 0} onClick={() => setIndice(indice - 1)}>
          ← Voltar
        </button>
        <button className="btn-primario" disabled={!respondida} onClick={avancar}>
          {ultima ? 'Montar meu perfil ✨' : 'Próxima →'}
        </button>
      </div>
    </section>
  );
}

// Pergunta 10: busca de títulos com autocompletar + "O que você amou neles?"
function PerguntaTitulos({ pergunta, resposta, sugestoes, onChange, destacarSugestoes }) {
  const ids = resposta.option_ids || [];
  const [detalhes, setDetalhes] = useState({}); // "tv:123" -> { titulo, poster_path, ano }

  // Títulos salvos em outra visita: busca nome e pôster para mostrar
  useEffect(() => {
    for (const id of ids) {
      if (detalhes[id]) continue;
      const [tipo, tmdbId] = id.split(':');
      cmApi
        .titulo(tipo, tmdbId)
        .then((t) => setDetalhes((d) => ({ ...d, [id]: t })))
        .catch(() => setDetalhes((d) => ({ ...d, [id]: { titulo: 'Título salvo' } })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  const adicionar = (t) => {
    const id = `${t.tipo}:${t.tmdb_id}`;
    if (ids.includes(id) || ids.length >= pergunta.maxTitulos) return;
    setDetalhes((d) => ({ ...d, [id]: t }));
    onChange({ ...resposta, option_ids: [...ids, id] });
  };
  const remover = (id) => onChange({ ...resposta, option_ids: ids.filter((x) => x !== id) });

  const sugestoesLivres = sugestoes.filter((s) => !ids.includes(`${s.tipo}:${s.tmdb_id}`));

  return (
    <div className="space-y-6">
      {ids.length < pergunta.maxTitulos && <TitleSearch onEscolher={adicionar} autoFocus />}

      {!!sugestoesLivres.length && ids.length < pergunta.maxTitulos && (
        <div>
          <p className="mb-2 text-sm text-cine-muted">{destacarSugestoes ? '❤️ Você amou estes no seu histórico:' : 'Sugestões dos que você amou:'}</p>
          <div className="flex flex-wrap gap-2">
            {sugestoesLivres.slice(0, 8).map((s) => (
              <button key={`${s.tipo}:${s.tmdb_id}`} className="chip" onClick={() => adicionar(s)}>
                + {s.titulo}
              </button>
            ))}
          </div>
        </div>
      )}

      {!!ids.length && (
        <ul className="grid grid-cols-3 gap-4 sm:max-w-md">
          {ids.map((id) => (
            <li key={id} className="relative">
              <div className="overflow-hidden rounded-xl border border-cine-border">
                <Poster path={detalhes[id]?.poster_path} titulo={detalhes[id]?.titulo || '…'} tamanho="w185" />
              </div>
              <p className="mt-1 line-clamp-2 text-xs">{detalhes[id]?.titulo || 'Carregando…'}</p>
              <button
                onClick={() => remover(id)}
                aria-label={`Remover ${detalhes[id]?.titulo || 'título'}`}
                className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-cine-border bg-cine-surface text-sm hover:bg-cine-danger"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-cine-muted">
        {ids.length}/{pergunta.maxTitulos} escolhidos
      </p>

      <ExplicarMelhor
        aberto
        setAberto={() => {}}
        valor={resposta.comentario || ''}
        onChange={(comentario) => onChange({ ...resposta, option_ids: ids, comentario })}
        rotulo="O que você amou neles?"
        placeholder="Ex.: a atmosfera sombria, a trama que se encaixa no final, os personagens…"
      />
    </div>
  );
}
