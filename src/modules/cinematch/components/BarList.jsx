// Gráfico de barras horizontais simples (uma série só): rótulo à esquerda, valor à direita.
// O número fica escrito ao lado da barra, então a informação nunca depende só da cor.
export default function BarList({ titulo, itens, formatar = (v) => v, vazio = 'Sem dados ainda.' }) {
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <figure className="cartao p-5">
      <figcaption className="mb-4 text-sm font-semibold">{titulo}</figcaption>
      {!itens.length ? (
        <p className="text-sm text-cine-muted">{vazio}</p>
      ) : (
        <ul className="space-y-2.5">
          {itens.map((i) => (
            <li key={i.chave || i.nome} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-sm" title={`${i.nome}: ${formatar(i.valor)}`}>
              <span className="truncate text-cine-muted">{i.nome}</span>
              <span className="h-2.5 rounded-full bg-cine-surface-2">
                <span className="block h-full rounded-full bg-cine-chart transition-all" style={{ width: `${Math.max((i.valor / max) * 100, 3)}%` }} />
              </span>
              <span className="w-10 text-right tabular-nums text-cine-text">{formatar(i.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
