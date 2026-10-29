import { useEffect, useId, useRef, useState } from 'react';
import { cmApi } from '../lib/api.js';
import { posterUrl } from '../lib/format.js';

// Campo de busca com autocompletar pelo TMDB (com pôster).
// Usado na pergunta 10 do quiz e para corrigir títulos não identificados na importação.
export default function TitleSearch({ onEscolher, placeholder = 'Digite o nome de um filme ou série…', autoFocus = false, valorInicial = '' }) {
  const [q, setQ] = useState(valorInicial);
  const [resultados, setResultados] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [ativo, setAtivo] = useState(-1);
  const listaId = useId();
  const caixa = useRef(null);

  // Espera a pessoa parar de digitar (300ms) antes de buscar
  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) {
      setResultados([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setCarregando(true);
      setErro(null);
      cmApi
        .buscarTitulos(termo, ctrl.signal)
        .then((r) => {
          setResultados(r.resultados);
          setAtivo(-1);
          setAberto(true);
        })
        .catch((e) => e.name !== 'AbortError' && setErro(e.message))
        .finally(() => setCarregando(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  // Fecha a lista ao clicar fora
  useEffect(() => {
    const fora = (e) => !caixa.current?.contains(e.target) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const escolher = (r) => {
    onEscolher(r);
    setQ('');
    setResultados([]);
    setAberto(false);
  };

  const teclado = (e) => {
    if (!aberto || !resultados.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAtivo((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && ativo >= 0) {
      e.preventDefault();
      escolher(resultados[ativo]);
    } else if (e.key === 'Escape') setAberto(false);
  };

  return (
    <div ref={caixa} className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cine-muted" aria-hidden>🔍</span>
        <input
          className="campo pl-10"
          value={q}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => resultados.length && setAberto(true)}
          onKeyDown={teclado}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listaId}
          aria-autocomplete="list"
        />
        {carregando && <span className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-cine-border border-t-cine-accent" />}
      </div>
      {erro && <p className="mt-1 text-xs text-red-300">{erro}</p>}

      {aberto && q.trim().length >= 2 && (
        <ul id={listaId} role="listbox" className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-cine-border bg-cine-surface-2 py-1 shadow-2xl">
          {!resultados.length && !carregando && <li className="px-4 py-3 text-sm text-cine-muted">Nada encontrado.</li>}
          {resultados.map((r, i) => (
            <li key={`${r.tipo}:${r.tmdb_id}`} role="option" aria-selected={ativo === i}>
              <button
                type="button"
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(r)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${ativo === i ? 'bg-cine-border/60' : ''}`}
              >
                <span className="h-14 w-10 shrink-0 overflow-hidden rounded bg-cine-bg">
                  {r.poster_path && <img src={posterUrl(r.poster_path, 'w92')} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.titulo}</span>
                  <span className="block text-xs text-cine-muted">
                    {r.tipo === 'tv' ? 'Série' : 'Filme'}
                    {r.ano ? ` · ${r.ano}` : ''}
                    {r.titulo_original && r.titulo_original !== r.titulo ? ` · ${r.titulo_original}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
