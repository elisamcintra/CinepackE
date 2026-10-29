// Estados genéricos de tela: vazio e erro (com "Tentar de novo")

export function EmptyState({ icone = '🎞️', titulo, children, acao }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-cine-border px-6 py-12 text-center">
      <div className="text-4xl" aria-hidden>{icone}</div>
      <h3 className="mt-3 font-semibold">{titulo}</h3>
      {children && <p className="mt-2 text-sm text-cine-muted">{children}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

export function ErrorState({ mensagem, onTentar }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-cine-danger/40 bg-cine-danger/5 px-6 py-10 text-center">
      <div className="text-3xl" aria-hidden>⚠️</div>
      <p className="mt-3 text-sm text-red-200">{mensagem || 'Algo deu errado.'}</p>
      {onTentar && (
        <button onClick={onTentar} className="btn-secundario mt-5">
          Tentar de novo
        </button>
      )}
    </div>
  );
}
