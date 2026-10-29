import { useEffect, useState } from 'react';
import { cmApi } from '../lib/api.js';
import { CLIMAS } from './MoodPicker.jsx';

// Mini formulário de pesquisa com vários filtros + texto livre interpretado pela IA.
export const FILTROS_PADRAO = {
  tipo: 'ambos',
  generos: [],
  excluirGeneros: [],
  duracaoMin: null,
  duracaoMax: null,
  temporadas: 'qualquer',
  anoMin: null,
  anoMax: null,
  notaMin: 0,
  votosMin: 50,
  idiomas: [],
  classificacaoMax: null,
  clima: null,
  joias: false,
  ordenar: 'combina',
};

const ANO_ATUAL = new Date().getFullYear();
const PRESETS_DURACAO = [
  { texto: 'Até 90 min', min: null, max: 90 },
  { texto: '90 a 120 min', min: 90, max: 120 },
  { texto: 'Mais de 2h', min: 120, max: null },
];
const PRESETS_ANO = [
  { texto: 'Clássicos (antes de 1990)', min: null, max: 1989 },
  { texto: 'Anos 2000', min: 2000, max: 2009 },
  { texto: 'Últimos 5 anos', min: ANO_ATUAL - 5, max: null },
];
const CLASSIFICACOES = [
  { id: 'L', texto: 'Livre' },
  { id: '10', texto: '10' },
  { id: '12', texto: '12' },
  { id: '14', texto: '14' },
  { id: '16', texto: '16' },
  { id: '18', texto: '18' },
];
const IDIOMAS_DESTAQUE = ['pt', 'en', 'es', 'ko', 'ja', 'fr', 'de', 'it', 'sv', 'da', 'no', 'tr', 'hi'];

// A lista de gêneros/idiomas só é buscada uma vez
let listasPromise = null;
const carregarListas = () => (listasPromise ||= cmApi.generos().catch((e) => ((listasPromise = null), Promise.reject(e))));

export default function FilterForm({ valorInicial, textoInicial = '', onPesquisar, carregando, botaoTexto = 'Pesquisar' }) {
  const [f, setF] = useState({ ...FILTROS_PADRAO, ...(valorInicial || {}) });
  const [texto, setTexto] = useState(textoInicial);
  const [listas, setListas] = useState(null);
  const [mostrarExcluir, setMostrarExcluir] = useState(!!valorInicial?.excluirGeneros?.length);

  useEffect(() => {
    carregarListas().then(setListas).catch(() => setListas({ generos: [], idiomas: [] }));
  }, []);

  const set = (campo, valor) => setF((x) => ({ ...x, [campo]: valor }));
  const alternarEm = (campo, valor) => setF((x) => ({ ...x, [campo]: x[campo].includes(valor) ? x[campo].filter((v) => v !== valor) : [...x[campo], valor] }));

  const generosVisiveis = (listas?.generos || []).filter((g) => f.tipo === 'ambos' || (f.tipo === 'movie' ? g.filmes : g.series));
  const idiomas = (listas?.idiomas || []).filter((i) => IDIOMAS_DESTAQUE.includes(i.codigo));

  const enviar = (e) => {
    e.preventDefault();
    onPesquisar(f, texto.trim());
  };

  const limpar = () => {
    setF(FILTROS_PADRAO);
    setTexto('');
  };

  return (
    <form onSubmit={enviar} className="space-y-6">
      {/* Texto livre com IA */}
      <div>
        <label htmlFor="texto-livre" className="rotulo">
          ✨ Descreva o que você quer ver
        </label>
        <input
          id="texto-livre"
          className="campo text-base"
          placeholder='Ex.: "algo tipo Dark, mas menos confuso" ou "comédia leve para ver com minha mãe"'
          value={texto}
          maxLength={300}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Campo rotulo="Tipo">
          <Segmentado
            opcoes={[
              ['ambos', 'Ambos'],
              ['movie', 'Filmes'],
              ['tv', 'Séries'],
            ]}
            valor={f.tipo}
            onChange={(v) => set('tipo', v)}
          />
        </Campo>

        <Campo rotulo="Ordenar por">
          <select className="campo" value={f.ordenar} onChange={(e) => set('ordenar', e.target.value)}>
            <option value="combina">Combina mais comigo</option>
            <option value="nota">Nota</option>
            <option value="recentes">Mais recentes</option>
            <option value="popularidade">Popularidade</option>
          </select>
        </Campo>
      </div>

      <Campo rotulo="Gêneros">
        <Chips itens={generosVisiveis.map((g) => [g.chave, g.nome])} selecionados={f.generos} onAlternar={(v) => alternarEm('generos', v)} carregando={!listas} />
        <button type="button" className="btn-fantasma -ml-3 mt-2" onClick={() => setMostrarExcluir((m) => !m)}>
          {mostrarExcluir ? '− Esconder' : '+ Excluir gêneros'}
        </button>
        {mostrarExcluir && (
          <div className="mt-2">
            <Chips
              itens={generosVisiveis.filter((g) => !f.generos.includes(g.chave)).map((g) => [g.chave, g.nome])}
              selecionados={f.excluirGeneros}
              onAlternar={(v) => alternarEm('excluirGeneros', v)}
              negativo
            />
          </div>
        )}
      </Campo>

      <div className="grid gap-6 md:grid-cols-2">
        {f.tipo !== 'tv' && (
          <Campo rotulo={`Duração do filme${f.duracaoMin || f.duracaoMax ? `: ${f.duracaoMin || 0} a ${f.duracaoMax || '∞'} min` : ''}`}>
            <div className="flex flex-wrap gap-2">
              {PRESETS_DURACAO.map((p) => {
                const ativo = f.duracaoMin === p.min && f.duracaoMax === p.max;
                return (
                  <button
                    key={p.texto}
                    type="button"
                    className={`chip ${ativo ? 'chip-ativo' : ''}`}
                    onClick={() => setF((x) => ({ ...x, duracaoMin: ativo ? null : p.min, duracaoMax: ativo ? null : p.max }))}
                  >
                    {p.texto}
                  </button>
                );
              })}
            </div>
            <Slider rotulo="Mínimo" min={0} max={240} passo={5} valor={f.duracaoMin || 0} sufixo="min" onChange={(v) => set('duracaoMin', v || null)} />
            <Slider rotulo="Máximo" min={30} max={240} passo={5} valor={f.duracaoMax || 240} sufixo="min" onChange={(v) => set('duracaoMax', v >= 240 ? null : v)} />
          </Campo>
        )}
        {f.tipo !== 'movie' && (
          <Campo rotulo="Tamanho da série">
            <Segmentado
              opcoes={[
                ['mini', 'Minissérie (1 temporada)'],
                ['ate3', 'Até 3 temporadas'],
                ['qualquer', 'Qualquer'],
              ]}
              valor={f.temporadas}
              onChange={(v) => set('temporadas', v)}
            />
          </Campo>
        )}

        <Campo rotulo="Ano de lançamento">
          <div className="flex items-center gap-2">
            <input type="number" className="campo" placeholder="De" min={1900} max={ANO_ATUAL} value={f.anoMin ?? ''} onChange={(e) => set('anoMin', e.target.value ? Number(e.target.value) : null)} />
            <span className="text-cine-muted">até</span>
            <input type="number" className="campo" placeholder="Até" min={1900} max={ANO_ATUAL + 1} value={f.anoMax ?? ''} onChange={(e) => set('anoMax', e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS_ANO.map((p) => {
              const ativo = f.anoMin === p.min && f.anoMax === p.max;
              return (
                <button key={p.texto} type="button" className={`chip ${ativo ? 'chip-ativo' : ''}`} onClick={() => setF((x) => ({ ...x, anoMin: ativo ? null : p.min, anoMax: ativo ? null : p.max }))}>
                  {p.texto}
                </button>
              );
            })}
          </div>
        </Campo>

        <Campo rotulo="Nota mínima (TMDB)">
          <Slider rotulo="Nota" min={0} max={9} passo={0.5} valor={f.notaMin || 0} formatar={(v) => (v ? `${String(v).replace('.', ',')}+` : 'Qualquer')} onChange={(v) => set('notaMin', v)} />
          <label className="mt-3 flex items-center justify-between gap-3 text-sm text-cine-muted">
            Mínimo de votos
            <select className="campo w-auto py-1.5" value={f.votosMin} onChange={(e) => set('votosMin', Number(e.target.value))}>
              <option value={0}>Qualquer</option>
              <option value={50}>50+</option>
              <option value={200}>200+</option>
              <option value={1000}>1.000+</option>
              <option value={5000}>5.000+</option>
            </select>
          </label>
        </Campo>

        <Campo rotulo="Classificação indicativa (até)">
          <div className="flex flex-wrap gap-2">
            {CLASSIFICACOES.map((c) => (
              <button key={c.id} type="button" className={`chip ${f.classificacaoMax === c.id ? 'chip-ativo' : ''}`} onClick={() => set('classificacaoMax', f.classificacaoMax === c.id ? null : c.id)}>
                {c.texto}
              </button>
            ))}
          </div>
        </Campo>
      </div>

      <Campo rotulo="Idioma / país de origem">
        <Chips itens={idiomas.map((i) => [i.codigo, i.nome])} selecionados={f.idiomas} onAlternar={(v) => alternarEm('idiomas', v)} carregando={!listas} />
      </Campo>

      <div className="grid gap-6 md:grid-cols-2">
        <Campo rotulo="Clima">
          <div className="flex flex-wrap gap-2">
            {CLIMAS.map((c) => (
              <button key={c.id} type="button" className={`chip ${f.clima === c.id ? 'chip-ativo' : ''}`} onClick={() => set('clima', f.clima === c.id ? null : c.id)}>
                {c.texto}
              </button>
            ))}
          </div>
        </Campo>

        <Campo rotulo="Joias escondidas">
          <label className="flex cursor-pointer items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={f.joias}
              onClick={() => set('joias', !f.joias)}
              className={`relative h-7 w-12 rounded-full transition ${f.joias ? 'bg-cine-accent' : 'bg-cine-border'}`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${f.joias ? 'left-6' : 'left-1'}`} />
            </button>
            <span className="text-sm text-cine-muted">💎 Nota alta, pouca gente viu</span>
          </label>
        </Campo>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-cine-border/60 pt-4 sm:flex-row sm:justify-end">
        <button type="button" className="btn-fantasma" onClick={limpar}>
          Limpar filtros
        </button>
        <button type="submit" className="btn-primario" disabled={carregando}>
          {carregando ? 'Pesquisando…' : `🔍 ${botaoTexto}`}
        </button>
      </div>
    </form>
  );
}

function Campo({ rotulo, children }) {
  return (
    <fieldset>
      <legend className="rotulo">{rotulo}</legend>
      {children}
    </fieldset>
  );
}

function Chips({ itens, selecionados, onAlternar, negativo = false, carregando = false }) {
  if (carregando) return <div className="skeleton h-8 w-full" />;
  return (
    <div className="flex flex-wrap gap-2">
      {itens.map(([id, nome]) => {
        const ativo = selecionados.includes(id);
        return (
          <button key={id} type="button" aria-pressed={ativo} className={`chip ${ativo ? (negativo ? 'chip-negativo' : 'chip-ativo') : ''}`} onClick={() => onAlternar(id)}>
            {negativo && ativo ? '✕ ' : ''}
            {nome}
          </button>
        );
      })}
    </div>
  );
}

function Segmentado({ opcoes, valor, onChange }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-cine-border bg-cine-bg p-1">
      {opcoes.map(([id, texto]) => (
        <button
          key={id}
          type="button"
          aria-pressed={valor === id}
          onClick={() => onChange(id)}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${valor === id ? 'bg-cine-accent font-semibold text-black' : 'text-cine-muted hover:text-cine-text'}`}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

function Slider({ rotulo, min, max, passo, valor, onChange, sufixo = '', formatar }) {
  return (
    <label className="mt-3 block">
      <span className="flex justify-between text-xs text-cine-muted">
        <span>{rotulo}</span>
        <span className="font-medium text-cine-text">{formatar ? formatar(valor) : `${valor} ${sufixo}`}</span>
      </span>
      <input type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-cine-accent)]" />
    </label>
  );
}
