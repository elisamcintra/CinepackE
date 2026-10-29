import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ErrorState } from '../../../shared/ui/States.jsx';
import { useToast } from '../../../shared/ui/Toast.jsx';
import Dropzone from '../components/Dropzone.jsx';
import GerandoPerfil from '../components/GerandoPerfil.jsx';
import Poster from '../components/Poster.jsx';
import TitleSearch from '../components/TitleSearch.jsx';
import { cmApi } from '../lib/api.js';
import { calcularPeso, parseNetflixCsv } from '../lib/parseNetflixCsv.js';

// Caminho 1: "Descubra o que assistir pelo histórico da Netflix"
// Etapas: tutorial -> identificando -> revisao -> avaliacao -> gerando (ou quiz, no modo combinado)

const TAMANHO_LOTE = 40;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Historico() {
  const [params] = useSearchParams();
  const combinado = params.get('modo') === 'combinado';
  const navigate = useNavigate();
  const toast = useToast();

  const [etapa, setEtapa] = useState('tutorial');
  const [erro, setErro] = useState(null);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [linhas, setLinhas] = useState([]); // [{ item, match, ignorado }]
  const [salvando, setSalvando] = useState(false);
  const itensRef = useRef([]);
  const [semNome, setSemNome] = useState(0);

  // ---------- 1. Ler o CSV e identificar no TMDB ----------
  const receberArquivo = async (arquivo) => {
    setErro(null);
    try {
      const { itens, linhasSemNome } = await parseNetflixCsv(arquivo);
      itensRef.current = itens;
      setSemNome(linhasSemNome || 0);
      setLinhas([]);
      await identificar(0, []);
    } catch (e) {
      setErro(e.message);
      setEtapa('tutorial');
    }
  };

  const identificar = async (inicio, acumulado) => {
    const itens = itensRef.current;
    setEtapa('identificando');
    setErro(null);
    setProgresso({ feitos: inicio, total: itens.length });
    const resultado = [...acumulado];

    for (let i = inicio; i < itens.length; i += TAMANHO_LOTE) {
      const lote = itens.slice(i, i + TAMANHO_LOTE);
      let resposta;
      for (let tentativa = 0; tentativa < 2 && !resposta; tentativa++) {
        try {
          resposta = await cmApi.identificarLote(
            lote.map((x) => ({ titulo: x.tituloBusca, tipoProvavel: x.tipoProvavel, vistoEm: x.primeiraData, tituloSerie: x.tituloSerie }))
          );
        } catch (e) {
          if (tentativa === 1) {
            setLinhas(resultado);
            setErro({ mensagem: e.message, retomarEm: i, acumulado: resultado });
            return;
          }
          await espera(1500);
        }
      }
      lote.forEach((item, j) => {
        const r = resposta.resultados[j] || {};
        resultado.push({ item, match: r.match || null, opcoes: r.opcoes || null, motivo: r.motivo || null, ignorado: false });
      });
      setProgresso({ feitos: Math.min(i + TAMANHO_LOTE, itens.length), total: itens.length });
      await espera(150); // pequena pausa entre lotes para respeitar o limite do TMDB
    }
    setLinhas(resultado);
    setEtapa('revisao');
  };

  // ---------- 2. Salvar ----------
  const salvar = async () => {
    setSalvando(true);
    try {
      const itens = linhas
        .filter((l) => !l.ignorado)
        .map(({ item, match }) => {
          // Se o TMDB disse que é série (ou filme) diferente do que o CSV sugeria, recalcula o peso
          let base = item;
          if (match && match.tipo !== item.tipoProvavel) {
            base =
              match.tipo === 'tv'
                ? { ...item, tipoProvavel: 'tv', episodios: item.vezes, vezes: 1 }
                : { ...item, tipoProvavel: 'movie', vezes: Math.max(1, item.episodios), episodios: 0 };
            base.peso = calcularPeso(base);
          }
          return {
            titulo_original: item.titulo,
            titulo_tmdb: match?.titulo || null,
            tmdb_id: match?.tmdb_id || null,
            tipo: match?.tipo || null,
            episodios_vistos: base.episodios,
            vezes: base.vezes,
            ultima_data: item.ultimaData,
            peso: base.peso,
            generos: match?.genre_ids || [],
            idioma_original: match?.idioma_original || null,
            ano: match?.ano || null,
            poster_path: match?.poster_path || null,
          };
        });
      // Envia em partes para não estourar o tamanho da requisição
      for (let i = 0; i < itens.length; i += 800) await cmApi.salvarImportacao(itens.slice(i, i + 800));
      // O histórico que acabou de ser importado vira o oficial: o que sobrou de importações antigas sai
      await cmApi.finalizarImportacao(itens.map((x) => x.titulo_original));
      setEtapa('avaliacao');
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast(`Não consegui salvar o histórico: ${e.message}`, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const depoisDaAvaliacao = () => {
    if (combinado) navigate('/cinematch/quiz?modo=combinado');
    else setEtapa('gerando');
  };

  if (etapa === 'gerando') return <GerandoPerfil />;

  return (
    <section className="mx-auto max-w-4xl">
      {combinado && (
        <p className="mb-4 inline-block rounded-full bg-cine-accent/15 px-3 py-1 text-xs font-semibold text-cine-accent">Passo 1 de 2 · Histórico da Netflix</p>
      )}

      {etapa === 'tutorial' && <Tutorial onArquivo={receberArquivo} erro={typeof erro === 'string' ? erro : null} />}

      {etapa === 'identificando' && (
        <Identificando progresso={progresso} erro={erro} onTentar={() => identificar(erro.retomarEm, erro.acumulado)} />
      )}

      {etapa === 'revisao' && <Revisao linhas={linhas} setLinhas={setLinhas} onContinuar={salvar} salvando={salvando} semNome={semNome} />}

      {etapa === 'avaliacao' && <AvaliacaoRapida linhas={linhas} onConcluir={depoisDaAvaliacao} />}
    </section>
  );
}

// ---------- Tutorial ----------

const PASSOS = [
  {
    titulo: 'Abra a página de atividade da Netflix',
    texto: 'Faça login na Netflix pelo navegador do computador, se pedir.',
    botao: { texto: 'Abrir netflix.com/viewingactivity ↗', href: 'https://www.netflix.com/viewingactivity' },
    imagem: '/tutorial/passo-1.gif',
  },
  {
    titulo: 'Escolha o seu perfil',
    texto: 'Se a conta tem vários perfis, confirme que está no seu. Cada perfil tem um histórico separado.',
    imagem: '/tutorial/passo-2.gif',
  },
  { titulo: 'Role até o final da página', texto: 'A lista pode ser longa, continue descendo até o fim.', imagem: '/tutorial/passo-3.gif' },
  {
    titulo: 'Clique em "Baixar tudo" (ou "Download all")',
    texto: 'O arquivo baixado se chama NetflixViewingHistory.csv e costuma ir para a pasta Downloads.',
    imagem: '/tutorial/passo-4.gif',
  },
];

function Tutorial({ onArquivo, erro }) {
  return (
    <>
      <h1 className="font-display text-5xl tracking-wide">Seu histórico da Netflix</h1>
      <p className="mt-2 text-cine-muted">Leva 1 minuto. Siga os passos abaixo e depois arraste o arquivo para cá.</p>

      <ol className="mt-8 space-y-4">
        {PASSOS.map((p, i) => (
          <li key={p.titulo} className="cartao grid gap-4 p-5 sm:grid-cols-[1fr_220px] sm:items-center">
            <div className="flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cine-accent font-bold text-black">{i + 1}</span>
              <div>
                <h2 className="font-semibold">{p.titulo}</h2>
                <p className="mt-1 text-sm text-cine-muted">{p.texto}</p>
                {p.botao && (
                  <a href={p.botao.href} target="_blank" rel="noreferrer" className="btn-primario mt-3 text-sm">
                    {p.botao.texto}
                  </a>
                )}
              </div>
            </div>
            <ImagemTutorial src={p.imagem} legenda={`Passo ${i + 1}`} />
          </li>
        ))}
        <li className="cartao p-5">
          <div className="mb-4 flex gap-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cine-accent font-bold text-black">5</span>
            <h2 className="self-center font-semibold">Arraste o arquivo para cá</h2>
          </div>
          <Dropzone onArquivo={onArquivo} />
          {erro && <p className="mt-3 rounded-lg bg-cine-danger/10 px-3 py-2 text-sm text-red-300">{erro}</p>}
          <p className="mt-3 text-xs text-cine-muted">
            🔒 O arquivo é lido pelo app só para identificar os títulos. Não pedimos sua senha da Netflix.
          </p>
        </li>
      </ol>

      <div className="mt-8">
        <h2 className="mb-3 font-semibold">Problemas comuns</h2>
        <div className="space-y-2">
          <Acordeao titulo='Não acho o botão "Baixar tudo"'>
            Precisa ser no navegador do computador (Chrome, Edge, Firefox…). O app da Netflix no celular ou na TV não tem essa opção.
          </Acordeao>
          <Acordeao titulo="O arquivo está vazio">Confira se você escolheu o perfil certo: cada perfil tem um histórico separado.</Acordeao>
          <Acordeao titulo="Meus dados estão seguros?">
            O arquivo é lido pelo app só para identificar os títulos. Não pedimos sua senha da Netflix, e cada usuário só vê os próprios dados.
          </Acordeao>
        </div>
      </div>
    </>
  );
}

// Mostra a imagem/GIF do passo; se ainda não existir em public/tutorial/, mostra um espaço reservado
function ImagemTutorial({ src, legenda }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) {
    return (
      <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-cine-border bg-cine-bg/60 text-center text-xs text-cine-muted">
        <span>
          🖼️ {legenda}
          <br />
          (imagem ilustrativa)
        </span>
      </div>
    );
  }
  return <img src={src} alt={`Ilustração do ${legenda.toLowerCase()}`} onError={() => setFalhou(true)} className="aspect-video w-full rounded-xl border border-cine-border object-cover" />;
}

function Acordeao({ titulo, children }) {
  return (
    <details className="cartao group px-5 py-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
        {titulo}
        <span className="text-cine-muted transition group-open:rotate-180">⌄</span>
      </summary>
      <p className="mt-2 text-sm text-cine-muted">{children}</p>
    </details>
  );
}

// ---------- Identificando ----------

function Identificando({ progresso, erro, onTentar }) {
  const pct = progresso.total ? Math.round((progresso.feitos / progresso.total) * 100) : 0;
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="font-display text-4xl tracking-wide">Identificando {progresso.total} títulos…</h1>
      <p className="mt-2 text-cine-muted">Estamos procurando cada filme e série no catálogo do TMDB.</p>
      <div className="mt-8 h-3 overflow-hidden rounded-full bg-cine-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-cine-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-sm tabular-nums text-cine-muted">
        {progresso.feitos} de {progresso.total} ({pct}%)
      </p>
      {erro && typeof erro === 'object' && (
        <div className="mt-8">
          <ErrorState mensagem={`A identificação parou: ${erro.mensagem}`} onTentar={onTentar} />
        </div>
      )}
    </div>
  );
}

// ---------- Revisão: títulos não identificados ----------

function Revisao({ linhas, setLinhas, onContinuar, salvando, semNome = 0 }) {
  const [limite, setLimite] = useState(20);
  const [corrigindo, setCorrigindo] = useState(null);
  const identificados = linhas.filter((l) => l.match && !l.ignorado).length;
  const pendentes = linhas.map((l, i) => ({ ...l, i })).filter((l) => !l.match && !l.ignorado);
  const series = linhas.filter((l) => l.match?.tipo === 'tv').length;

  const atualizar = (i, mudanca) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...mudanca } : l)));

  return (
    <>
      <h1 className="font-display text-5xl tracking-wide">Histórico lido! 🎉</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Numero valor={linhas.length} rotulo="títulos únicos no arquivo" />
        <Numero valor={identificados} rotulo="identificados no TMDB" destaque />
        <Numero valor={series} rotulo="são séries (episódios agrupados)" />
      </div>
      {semNome > 0 && (
        <p className="mt-3 text-sm text-cine-muted">
          {semNome} {semNome === 1 ? 'linha veio' : 'linhas vieram'} sem o nome do título (por exemplo, ": Episódio 3"). A Netflix exporta assim
          títulos que saíram do catálogo. Elas foram ignoradas para não virarem favoritos errados.
        </p>
      )}

      {pendentes.length > 0 ? (
        <div className="mt-10">
          <h2 className="text-lg font-semibold">Não identificamos estes ({pendentes.length})</h2>
          <p className="mt-1 text-sm text-cine-muted">
            Só associamos um título quando o nome é idêntico ao do catálogo, sem adivinhar. Para estes, escolha a opção certa, busque o título ou
            ignore. Não é obrigatório: os que ficarem pendentes não entram no seu perfil.
          </p>
          <ul className="mt-4 divide-y divide-cine-border/60 rounded-2xl border border-cine-border">
            {pendentes.slice(0, limite).map((l) => (
              <li key={l.i} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate">{l.item.titulo}</span>
                    <span className="block text-xs text-cine-muted">
                      {l.opcoes?.length ? 'Há mais de um título com este nome: qual você assistiu?' : 'Nenhum título com este nome exato.'}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <button className="btn-fantasma" onClick={() => setCorrigindo(corrigindo === l.i ? null : l.i)}>
                      ✏️ Corrigir
                    </button>
                    <button className="btn-fantasma" onClick={() => atualizar(l.i, { ignorado: true })}>
                      Ignorar
                    </button>
                  </span>
                </div>
                {!!l.opcoes?.length && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {l.opcoes.map((o) => (
                      <li key={`${o.tipo}:${o.tmdb_id}`}>
                        <button
                          className="flex items-center gap-2 rounded-xl border border-cine-border p-1.5 pr-3 text-left text-xs hover:border-cine-accent"
                          onClick={() => atualizar(l.i, { match: o })}
                        >
                          <span className="w-8 shrink-0 overflow-hidden rounded">
                            <Poster path={o.poster_path} titulo={o.titulo} tamanho="w92" />
                          </span>
                          <span>
                            <span className="block font-semibold">{o.titulo}</span>
                            <span className="text-cine-muted">
                              {o.tipo === 'tv' ? 'Série' : 'Filme'}
                              {o.ano ? ` · ${o.ano}` : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {corrigindo === l.i && (
                  <div className="mt-2">
                    <TitleSearch
                      autoFocus
                      valorInicial={l.item.titulo}
                      onEscolher={(r) => {
                        atualizar(l.i, { match: r });
                        setCorrigindo(null);
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {pendentes.length > limite && (
            <button className="btn-fantasma mt-2" onClick={() => setLimite(limite + 30)}>
              Mostrar mais ({pendentes.length - limite})
            </button>
          )}
        </div>
      ) : (
        <p className="mt-8 text-cine-muted">Todos os títulos foram identificados. 👌</p>
      )}

      <div className="sticky bottom-0 -mx-4 mt-10 flex justify-end border-t border-cine-border/60 bg-cine-bg/90 px-4 py-4 backdrop-blur">
        <button className="btn-primario" onClick={onContinuar} disabled={salvando || !identificados}>
          {salvando ? 'Salvando…' : 'Salvar e continuar →'}
        </button>
      </div>
    </>
  );
}

function Numero({ valor, rotulo, destaque }) {
  return (
    <div className={`cartao p-4 ${destaque ? 'border-cine-accent/60' : ''}`}>
      <p className={`font-display text-4xl ${destaque ? 'text-cine-accent' : ''}`}>{valor}</p>
      <p className="text-sm text-cine-muted">{rotulo}</p>
    </div>
  );
}

// ---------- Avaliação rápida ----------

const OPCOES_NOTA = [
  { nota: 5, emoji: '❤️', texto: 'Amei' },
  { nota: 4, emoji: '👍', texto: 'Gostei' },
  { nota: 3, emoji: '😐', texto: 'Ok' },
  { nota: 1, emoji: '👎', texto: 'Não gostei' },
];

// Os 20 mais relevantes: os de maior peso + alguns dos mais recentes
function escolherParaAvaliar(linhas) {
  const validos = linhas.filter((l) => l.match && !l.ignorado);
  const vistos = new Set();
  const lista = [];
  const add = (l) => {
    const k = `${l.match.tipo}:${l.match.tmdb_id}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    lista.push(l);
  };
  [...validos].sort((a, b) => b.item.peso - a.item.peso).slice(0, 14).forEach(add);
  [...validos].sort((a, b) => (b.item.ultimaData || '').localeCompare(a.item.ultimaData || '')).forEach((l) => lista.length < 20 && add(l));
  return lista.slice(0, 20);
}

function AvaliacaoRapida({ linhas, onConcluir }) {
  const [titulos] = useState(() => escolherParaAvaliar(linhas));
  const [notas, setNotas] = useState({});
  const [salvando, setSalvando] = useState(false);
  const toast = useToast();
  const avaliados = Object.values(notas).filter((n) => n !== 'pular').length;

  const concluir = async () => {
    setSalvando(true);
    try {
      const itens = titulos
        .filter((l) => typeof notas[`${l.match.tipo}:${l.match.tmdb_id}`] === 'number')
        .map(({ match: m }) => ({
          tmdb_id: m.tmdb_id,
          tipo: m.tipo,
          status: 'ja_vi',
          nota: notas[`${m.tipo}:${m.tmdb_id}`],
          origem: 'avaliacao_rapida',
          dados: { titulo: m.titulo, titulo_original: m.titulo_original, poster_path: m.poster_path, ano: m.ano, genre_ids: m.genre_ids, idioma_original: m.idioma_original },
        }));
      if (itens.length) await cmApi.marcarLote(itens);
      onConcluir();
    } catch (e) {
      toast(`Não consegui salvar as avaliações: ${e.message}`, 'erro');
      setSalvando(false);
    }
  };

  return (
    <>
      <h1 className="font-display text-5xl tracking-wide">Avaliação rápida</h1>
      <p className="mt-2 max-w-2xl text-cine-muted">
        Estes são os títulos mais marcantes do seu histórico. Avaliar é <strong className="text-cine-text">opcional</strong>, mas melhora muito as
        recomendações. Todos já foram marcados como "Já vi" e nunca vão aparecer como sugestão.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {titulos.map(({ match: m, item }) => {
          const k = `${m.tipo}:${m.tmdb_id}`;
          const atual = notas[k];
          return (
            <li key={k} className={`cartao overflow-hidden transition ${atual === 'pular' ? 'opacity-40' : ''}`}>
              <div className="relative">
                <Poster path={m.poster_path} titulo={m.titulo} tamanho="w342" />
                {typeof atual === 'number' && (
                  <span className="absolute right-2 top-2 rounded-full bg-black/80 px-2 py-1 text-lg">{OPCOES_NOTA.find((o) => o.nota === atual)?.emoji}</span>
                )}
              </div>
              <div className="p-3">
                <p className="line-clamp-1 text-sm font-medium" title={m.titulo}>
                  {m.titulo}
                </p>
                <p className="text-xs text-cine-muted">
                  {m.tipo === 'tv' ? `Série · ${item.episodios} ep. vistos` : `Filme${item.vezes > 1 ? ` · visto ${item.vezes}x` : ''}`}
                </p>
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {OPCOES_NOTA.map((o) => (
                    <button
                      key={o.nota}
                      title={o.texto}
                      aria-label={`${o.texto}: ${m.titulo}`}
                      aria-pressed={atual === o.nota}
                      onClick={() => setNotas((n) => ({ ...n, [k]: atual === o.nota ? undefined : o.nota }))}
                      className={`rounded-lg py-1.5 text-lg transition ${atual === o.nota ? 'bg-cine-accent/25 ring-1 ring-cine-accent' : 'hover:bg-cine-surface-2'}`}
                    >
                      {o.emoji}
                    </button>
                  ))}
                </div>
                <button className="mt-1 w-full rounded-lg py-1 text-xs text-cine-muted hover:bg-cine-surface-2" onClick={() => setNotas((n) => ({ ...n, [k]: atual === 'pular' ? undefined : 'pular' }))}>
                  {atual === 'pular' ? 'Desfazer' : 'Pular'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-4 mt-10 flex items-center justify-between gap-3 border-t border-cine-border/60 bg-cine-bg/90 px-4 py-4 backdrop-blur">
        <span className="text-sm text-cine-muted">{avaliados} avaliados</span>
        <span className="flex gap-2">
          {!avaliados && (
            <button className="btn-fantasma" onClick={onConcluir} disabled={salvando}>
              Pular esta etapa
            </button>
          )}
          <button className="btn-primario" onClick={concluir} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Concluir →'}
          </button>
        </span>
      </div>
    </>
  );
}
