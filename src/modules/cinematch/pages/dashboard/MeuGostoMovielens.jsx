import { useEffect, useState } from 'react';
import { useToast } from '../../../../shared/ui/Toast.jsx';
import { cmApi } from '../../lib/api.js';

const FONTE = {
  nota: (x) => `sua nota ${x.nota}★`,
  nao_interessa: () => '"Não me interessa"',
  historico_1: () => 'visto 1 vez',
  historico_2: () => 'visto 2+ vezes',
};
const NOTAS = [
  { nota: 5, emoji: '❤️', texto: 'Amei' },
  { nota: 4, emoji: '👍', texto: 'Gostei' },
  { nota: 3, emoji: '😐', texto: 'Ok' },
  { nota: 1, emoji: '👎', texto: 'Não gostei' },
];
const num = (v) => (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Todos os filmes da pessoa que o MovieLens conhece, com o peso de cada um (w = sinal × recência)
export function BaseMovielens() {
  const toast = useToast();
  const [base, setBase] = useState(null);
  const [erro, setErro] = useState(null);
  const [limite, setLimite] = useState(12);
  const [salvando, setSalvando] = useState(null);

  const carregar = () =>
    cmApi
      .baseMovielens()
      .then(setBase)
      .catch((e) => setErro(e.message));
  useEffect(() => {
    carregar();
  }, []);

  const avaliar = async (x, nota) => {
    setSalvando(x.tmdb_id);
    try {
      await cmApi.marcar({ tmdb_id: x.tmdb_id, tipo: 'movie', status: 'ja_vi', nota, dados: { titulo: x.titulo }, origem: 'base_movielens' });
      await carregar();
    } catch (e) {
      toast(e.message, 'erro');
    } finally {
      setSalvando(null);
    }
  };

  if (erro) return null;
  if (!base) return null;
  const semNota = base.itens.filter((x) => x.fonte !== 'nota').length;

  return (
    <div className="cartao space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold">🎬 Sua base no MovieLens</h2>
        <p className="mt-1 text-xs text-cine-muted">
          Todos os seus filmes que existem na base do MovieLens entram no cálculo, cada um com um peso: <strong>peso = sinal × recência</strong>.
          Sinal: nota 5★ = +1, 4★ = +0,5, 3★ = 0, 2★ = −0,5, 1★ = −1; "Não me interessa" = −0,6; só visto 1 vez = +0,4; 2+ vezes = +0,8.
          Recência: 1,0 para hoje, 0,75 para 2 anos atrás, nunca abaixo de 0,5. Séries não entram: o MovieLens só tem filmes.
        </p>
      </div>
      <p className="text-sm">
        <strong>{base.disponiveis}</strong> filmes na base (mínimo {base.minimo})
        {base.alfa < 1 && <span className="text-cine-muted"> · peso do MovieLens reduzido para {Math.round(base.alfa * 100)}%</span>}
      </p>
      {base.aviso && <p className="rounded-xl bg-cine-accent/10 px-3 py-2 text-sm text-cine-accent-strong">⚠️ {base.aviso}</p>}
      {semNota > 0 && (
        <p className="text-xs text-cine-muted">
          {semNota} {semNota === 1 ? 'filme ainda não tem' : 'filmes ainda não têm'} nota sua. Dar nota muda o peso de +0,4 (só "visto") para o que você
          realmente achou, inclusive negativo.
        </p>
      )}
      <ul className="divide-y divide-cine-border/60 text-sm">
        {base.itens.slice(0, limite).map((x) => (
          <li key={x.tmdb_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block truncate">{x.titulo}</span>
              <span className="text-xs text-cine-muted">
                {FONTE[x.fonte]?.(x)} · sinal {num(x.s)} × recência {x.r.toLocaleString('pt-BR')} ={' '}
                <strong className={x.w < 0 ? 'text-cine-danger' : ''}>{num(x.w)}</strong>
              </span>
            </span>
            {x.fonte !== 'nota' && (
              <span className="flex gap-1">
                {NOTAS.map((n) => (
                  <button key={n.nota} className="chip" disabled={salvando === x.tmdb_id} onClick={() => avaliar(x, n.nota)} title={n.texto}>
                    {n.emoji}
                  </button>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
      {base.itens.length > limite && (
        <button className="btn-fantasma" onClick={() => setLimite(limite + 30)}>
          Mostrar mais ({base.itens.length - limite})
        </button>
      )}
    </div>
  );
}

// Temas que nunca devem ser recomendados (ex.: video games)
export function TemasBloqueados() {
  const toast = useToast();
  const [dados, setDados] = useState(null);
  const [escolhidos, setEscolhidos] = useState(new Set());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    cmApi
      .temas()
      .then((d) => {
        setDados(d);
        setEscolhidos(new Set(d.bloqueados));
      })
      .catch(() => setDados(null));
  }, []);
  if (!dados) return null;

  const alternar = (id) =>
    setEscolhidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const salvar = async () => {
    setSalvando(true);
    try {
      await cmApi.salvarTemas([...escolhidos]);
      toast('Temas bloqueados salvos. As recomendações serão refeitas sem eles.');
    } catch (e) {
      toast(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="cartao space-y-3 p-5">
      <div>
        <h2 className="text-sm font-semibold">🚫 Temas que eu não quero ver</h2>
        <p className="mt-1 text-xs text-cine-muted">Títulos com estes temas nunca entram nas recomendações (a IA também é avisada).</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {dados.temas.map((t) => (
          <button key={t.id} className={`chip ${escolhidos.has(t.id) ? 'chip-negativo' : ''}`} onClick={() => alternar(t.id)}>
            {escolhidos.has(t.id) ? '🚫 ' : ''}
            {t.nome}
          </button>
        ))}
      </div>
      <button className="btn-secundario text-sm" onClick={salvar} disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar temas bloqueados'}
      </button>
    </div>
  );
}
