import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Spinner from '../../../../shared/ui/Spinner.jsx';
import { EmptyState, ErrorState } from '../../../../shared/ui/States.jsx';
import { useToast } from '../../../../shared/ui/Toast.jsx';
import BarList from '../../components/BarList.jsx';
import Poster from '../../components/Poster.jsx';
import { cmApi } from '../../lib/api.js';
import { dataCurta } from '../../lib/format.js';
import { useDashboard } from './DashboardContext.js';
import { BaseMovielens, TemasBloqueados } from './MeuGostoMovielens.jsx';

const FONTES = { quiz: 'Quiz', historico: 'Histórico da Netflix', combinado: 'Histórico + Quiz' };
const DURACOES = {
  filmes_curtos: 'Filmes de até 2 horas',
  filmes_ou_minisseries: 'Filmes ou minisséries fechadas',
  qualquer: 'Séries longas sem problema',
  depende: 'Depende do dia',
};

// Aba "Meu gosto": o perfil gerado (IA ou regras), gráficos e atalhos para refazer
export default function MeuGosto() {
  const { abrirDetalhes } = useDashboard();
  const toast = useToast();
  const [estado, setEstado] = useState({ carregando: true });
  const [recalculando, setRecalculando] = useState(false);

  const carregar = () => {
    setEstado({ carregando: true });
    cmApi
      .perfil()
      .then(({ perfil }) => setEstado({ linha: perfil }))
      .catch((e) => setEstado({ erro: e.message }));
  };
  useEffect(carregar, []);

  const recalcular = async () => {
    setRecalculando(true);
    try {
      await cmApi.gerarPerfil();
      toast('Perfil recalculado! As recomendações serão atualizadas.');
      carregar();
    } catch (e) {
      toast(e.message, 'erro');
    } finally {
      setRecalculando(false);
    }
  };

  if (estado.carregando) {
    return (
      <div className="grid h-60 place-items-center">
        <Spinner />
      </div>
    );
  }
  if (estado.erro) return <ErrorState mensagem={estado.erro} onTentar={carregar} />;
  if (!estado.linha) {
    return (
      <EmptyState icone="🧬" titulo="Você ainda não tem um perfil de gosto" acao={<Link to="/cinematch/inicio" className="btn-primario">Criar meu perfil</Link>}>
        Faça o quiz ou importe seu histórico da Netflix.
      </EmptyState>
    );
  }

  const p = estado.linha.perfil;
  const est = p.estatisticas || {};

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl tracking-wide">Meu gosto</h1>
          <p className="text-sm text-cine-muted">
            Fonte: {FONTES[estado.linha.fonte] || estado.linha.fonte} · atualizado em {dataCurta(estado.linha.atualizado_em)} ·{' '}
            {p.gerado_por === 'ia' ? '✨ gerado por IA' : 'gerado por regras (sem IA)'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/cinematch/quiz?refazer=1" className="btn-secundario text-sm">
            🎯 Refazer quiz
          </Link>
          <Link to="/cinematch/historico" className="btn-secundario text-sm">
            📜 Importar/atualizar histórico
          </Link>
          <button className="btn-secundario text-sm" onClick={recalcular} disabled={recalculando}>
            {recalculando ? 'Recalculando…' : '🔄 Recalcular'}
          </button>
        </div>
      </header>

      <blockquote className="cartao border-l-4 border-l-cine-accent p-6 text-lg leading-relaxed">{p.resumo}</blockquote>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          titulo="Gêneros favoritos (peso no seu perfil)"
          itens={(p.generos_favoritos || []).map((g) => ({ chave: g.chave, nome: g.nome, valor: Math.round(g.peso * 100) }))}
          formatar={(v) => `${v}%`}
          vazio="Ainda sem gêneros favoritos claros."
        />

        <div className="cartao space-y-5 p-5">
          <Grupo titulo="Evita">
            {(p.generos_evitar || []).length ? (
              <ul className="space-y-2">
                {p.generos_evitar.map((g) => (
                  <li key={g.chave} className="text-sm">
                    <span className="chip chip-negativo pointer-events-none">{g.nome}</span>
                    {g.nuance && <span className="ml-2 text-cine-muted">{g.nuance}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-cine-muted">Nenhum gênero evitado.</p>
            )}
          </Grupo>
          <Tags titulo="Tom que você curte" itens={p.tom} />
          <Tags titulo="Prefere evitar" itens={p.evitar} />
          <Tags titulo="Palavras-chave" itens={(p.palavras_chave || []).map((k) => k.termo)} />
          <Grupo titulo="Duração preferida">
            <p className="text-sm">{DURACOES[p.duracao_preferida] || 'Qualquer'}</p>
          </Grupo>
        </div>
      </div>

      {p.assinatura_resumo && (
        <div className="cartao space-y-5 p-5">
          <div>
            <h2 className="text-sm font-semibold">🧬 Seu DNA de cinema</h2>
            <p className="mt-1 text-xs text-cine-muted">
              O que se repete nos {p.assinatura?.amostras || ''} títulos que mais dizem sobre você. É isso que o CineMatch procura nos candidatos,
              além do gênero.
            </p>
          </div>
          <Tags titulo="Temas que você mais curte" itens={p.assinatura_resumo.temas.map((t) => t.texto)} destaque />
          <div className="grid gap-5 sm:grid-cols-2">
            <Tags titulo="Diretores e criadores" itens={p.assinatura_resumo.pessoas.map((t) => t.texto)} />
            <Tags titulo="Atores que aparecem nos seus favoritos" itens={p.assinatura_resumo.elenco.map((t) => t.texto)} />
          </div>
          <Tags titulo="Temas dos títulos que você rejeitou" itens={p.assinatura_resumo.temas_evitados} />
        </div>
      )}

      <BaseMovielens />
      {p.mineracao && <Mineracao dados={p.mineracao} abrirDetalhes={abrirDetalhes} />}
      <TemasBloqueados />

      {!!p.titulos_ancora?.length && (
        <div className="cartao p-5">
          <h2 className="mb-4 text-sm font-semibold">Suas referências (títulos-âncora)</h2>
          <ul className="sem-scrollbar flex gap-4 overflow-x-auto">
            {p.titulos_ancora.map((a) => (
              <li key={`${a.tipo}:${a.tmdb_id}`} className="w-28 shrink-0">
                <button onClick={() => abrirDetalhes(a)} className="block w-full overflow-hidden rounded-xl border border-cine-border" aria-label={`Ver ${a.titulo}`}>
                  <Poster path={a.poster_path} titulo={a.titulo} tamanho="w185" />
                </button>
                <p className="mt-1 line-clamp-2 text-xs">{a.titulo}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">O que você já assistiu</h2>
        <p className="mb-4 text-sm text-cine-muted">
          {est.total_vistos || 0} títulos vistos · {est.total_avaliados || 0} avaliados no app
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          <BarList titulo="Gêneros" itens={est.generos || []} />
          <BarList titulo="Idiomas originais" itens={est.idiomas || []} />
          <BarList titulo="Décadas" itens={est.decadas || []} />
        </div>
      </div>
    </section>
  );
}

// O que a mineração de dados do MovieLens descobriu a partir dos seus filmes favoritos
function Mineracao({ dados, abrirDetalhes }) {
  const abrir = (f) => abrirDetalhes({ tmdb_id: f.tmdb_id, tipo: 'movie', titulo: f.titulo, poster_path: f.poster_path });
  return (
    <div className="cartao space-y-5 p-5">
      <div>
        <h2 className="text-sm font-semibold">📊 Mineração de dados (MovieLens)</h2>
        <p className="mt-1 text-xs text-cine-muted">
          Padrões encontrados nas notas de ~200 mil pessoas da base pública MovieLens, a partir dos filmes que você curtiu.
        </p>
      </div>

      {!!dados.regras?.length && (
        <Grupo titulo="Regras de associação: quem amou… também amou">
          <ul className="grid gap-3 sm:grid-cols-2">
            {dados.regras.map((r) => (
              <li key={`${r.de.tmdb_id}-${r.para.tmdb_id}`} className="flex items-center gap-3 rounded-xl bg-cine-surface-2 p-3">
                <MiniPoster filme={r.de} onClick={() => abrir(r.de)} />
                <span className="text-cine-muted" aria-hidden="true">→</span>
                <MiniPoster filme={r.para} onClick={() => abrir(r.para)} />
                <div className="min-w-0 text-xs">
                  <p className="line-clamp-2">
                    Quem amou <strong>{r.de.titulo}</strong> também amou <strong>{r.para.titulo}</strong>
                  </p>
                  <p className="mt-1 text-cine-muted">
                    confiança {Math.round(r.confianca * 100)}% · lift {r.lift.toLocaleString('pt-BR')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <dl className="mt-3 grid gap-2 text-xs text-cine-muted sm:grid-cols-3">
            <div>
              <dt className="font-semibold text-cine-text">Suporte</dt>
              <dd>quantas pessoas, do total, gostaram dos dois filmes.</dd>
            </div>
            <div>
              <dt className="font-semibold text-cine-text">Confiança</dt>
              <dd>de quem gostou do primeiro, quantos % também gostaram do segundo.</dd>
            </div>
            <div>
              <dt className="font-semibold text-cine-text">Lift</dt>
              <dd>quantas vezes essa ligação é mais forte que o acaso (acima de 1 = ligação real).</dd>
            </div>
          </dl>
        </Grupo>
      )}

      {!!dados.familias?.length && (
        <Grupo titulo="Suas famílias de gosto (agrupamento k-means)">
          <ul className="flex flex-wrap gap-2">
            {dados.familias.map((f) => (
              <li
                key={f.nome + f.exemplos.join()}
                className="rounded-xl border border-cine-accent/40 bg-cine-accent/10 px-3 py-2 text-xs"
                title={`Seus filmes nesta família: ${f.seus.join(', ')}`}
              >
                <span className="font-semibold text-cine-accent-strong">{f.nome}</span>
                <span className="text-cine-muted"> · {f.quantidade} {f.quantidade === 1 ? 'favorito seu' : 'favoritos seus'}</span>
                <span className="block text-cine-muted">ex.: {f.exemplos.join(', ')}</span>
              </li>
            ))}
          </ul>
        </Grupo>
      )}
    </div>
  );
}

function MiniPoster({ filme, onClick }) {
  return (
    <button onClick={onClick} className="w-12 shrink-0 overflow-hidden rounded-lg border border-cine-border" aria-label={`Ver ${filme.titulo}`}>
      <Poster path={filme.poster_path} titulo={filme.titulo} tamanho="w92" />
    </button>
  );
}

function Grupo({ titulo, children }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cine-muted">{titulo}</h3>
      {children}
    </div>
  );
}

function Tags({ titulo, itens, destaque = false }) {
  if (!itens?.length) return null;
  return (
    <Grupo titulo={titulo}>
      <ul className="flex flex-wrap gap-1.5">
        {itens.map((t) => (
          <li key={t} className={`rounded-full px-2.5 py-1 text-xs ${destaque ? 'border border-cine-accent/40 bg-cine-accent/10 text-cine-accent-strong' : 'bg-cine-surface-2'}`}>
            {t}
          </li>
        ))}
      </ul>
    </Grupo>
  );
}
