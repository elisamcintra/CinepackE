// "Por que esta nota?": quanto cada componente somou na pontuação do título
// e quais títulos da pessoa geraram o sinal do MovieLens (com peso, similaridade e contribuição).

const NOMES = {
  assinatura_tmdb: 'Assinatura de gosto (temas, criadores, elenco · TMDB)',
  consenso_tmdb: 'Consenso entre seus favoritos (TMDB)',
  ia_sugestao: 'Sugerido pela IA',
  movielens: 'MovieLens (quem gostou dos seus filmes)',
  generos: 'Gêneros favoritos / evitados',
  idioma: 'Idioma preferido',
  palavras_chave: 'Palavras-chave do seu perfil',
  qualidade: 'Qualidade (nota bayesiana + popularidade)',
  formato: 'Formato preferido',
};

const num = (v, casas = 2) => (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export default function Rastreamento({ r }) {
  if (!r?.componentes) return null;
  const itens = Object.entries(r.componentes);
  const max = Math.max(...itens.map(([, v]) => Math.abs(v)), 0.01);
  const ml = r.movielens;

  return (
    <details className="rounded-xl border border-cine-border bg-cine-surface-2/40 px-4 py-3 text-sm">
      <summary className="cursor-pointer select-none font-semibold">🔍 Rastreamento da nota ({num(r.total)} pontos)</summary>

      <table className="mt-3 w-full text-xs">
        <tbody>
          {itens.map(([k, v]) => (
            <tr key={k} className="border-t border-cine-border/50">
              <td className="py-1.5 pr-2">{NOMES[k] || k}</td>
              <td className="w-28 py-1.5">
                <div className="h-1.5 rounded bg-cine-border/60">
                  <div className={`h-1.5 rounded ${v < 0 ? 'bg-cine-danger' : 'bg-cine-accent'}`} style={{ width: `${(Math.abs(v) / max) * 100}%` }} />
                </div>
              </td>
              <td className={`w-14 py-1.5 text-right tabular-nums ${v < 0 ? 'text-cine-danger' : v === 0 ? 'text-cine-muted' : ''}`}>{num(v)}</td>
            </tr>
          ))}
          <tr className="border-t border-cine-border font-semibold">
            <td className="py-1.5">Total</td>
            <td />
            <td className="py-1.5 text-right tabular-nums">{num(r.total)}</td>
          </tr>
        </tbody>
      </table>

      {r.ia?.escolhido && (
        <p className="mt-2 text-xs text-cine-muted">
          ✨ A IA escolheu este título na posição {r.ia.posicao}
          {r.ia.compatibilidade_ia != null && ` (compatibilidade da IA ${r.ia.compatibilidade_ia}% · das regras ${r.ia.compatibilidade_regras}%; a final mistura 70% e 30%)`}.
        </p>
      )}
      {!!r.origem?.length && <p className="mt-1 text-xs text-cine-muted">Chegou como candidato por: {r.origem.map((o) => ({ sementes_tmdb: 'recomendações do TMDB', sugestao_ia: 'sugestão da IA', movielens: 'MovieLens' })[o]).join(', ')}.</p>}

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-cine-muted">MovieLens</p>
        {!ml?.aplicavel ? (
          <p className="mt-1 text-xs text-cine-muted">{ml?.motivo || 'Sem dados do MovieLens.'}</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-cine-muted">
              Base: {ml.base?.disponiveis ?? 0} filmes seus
              {ml.base?.alfa < 1 && ` (peso reduzido para ${Math.round(ml.base.alfa * 100)}%: mínimo de 20)`} · {ml.quantos_titulos_seus} deles se ligam a
              este · sinal {ml.S.toLocaleString('pt-BR')} → {num(ml.pontos)} pontos
            </p>
            {!!ml.contribuintes?.length && (
              <table className="mt-2 w-full text-xs">
                <thead className="text-cine-muted">
                  <tr>
                    <th className="text-left font-normal">Seu título</th>
                    <th className="text-right font-normal">Peso</th>
                    <th className="text-right font-normal">Similaridade</th>
                    <th className="text-right font-normal">Contribuição</th>
                  </tr>
                </thead>
                <tbody>
                  {ml.contribuintes.map((c) => (
                    <tr key={c.tmdb_id} className="border-t border-cine-border/50">
                      <td className="py-1 pr-2">{c.titulo}</td>
                      <td className="py-1 text-right tabular-nums">{num(c.peso)}</td>
                      <td className="py-1 text-right tabular-nums">{c.sim.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</td>
                      <td className={`py-1 text-right tabular-nums ${c.contribuicao < 0 ? 'text-cine-danger' : ''}`}>{num(c.contribuicao, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </details>
  );
}
