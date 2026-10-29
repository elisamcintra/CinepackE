import { useState } from 'react';

// Uma pergunta do quiz: respostas em cards clicáveis + campo "Quer explicar melhor?"
export default function QuizQuestion({ pergunta, resposta, onChange }) {
  const selecionadas = resposta?.option_ids || [];
  const [explicar, setExplicar] = useState(!!resposta?.comentario);

  const alternar = (id) => {
    let novas;
    if (pergunta.multipla) novas = selecionadas.includes(id) ? selecionadas.filter((x) => x !== id) : [...selecionadas, id];
    else novas = [id];
    onChange({ ...resposta, option_ids: novas });
  };

  return (
    <div>
      <p className="mb-4 text-sm text-cine-muted">{pergunta.multipla ? 'Pode escolher mais de uma.' : 'Escolha a que mais combina com você.'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {pergunta.opcoes.map((o) => {
          const ativa = selecionadas.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role={pergunta.multipla ? 'checkbox' : 'radio'}
              aria-checked={ativa}
              onClick={() => alternar(o.id)}
              className={`group flex min-h-20 items-start gap-3 rounded-2xl border p-4 text-left transition ${
                ativa
                  ? 'border-cine-accent bg-cine-accent/10 shadow-[0_0_0_1px_var(--color-cine-accent)]'
                  : 'border-cine-border bg-cine-surface hover:border-cine-muted hover:bg-cine-surface-2'
              }`}
            >
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center border text-xs font-bold ${
                  pergunta.multipla ? 'rounded-md' : 'rounded-full'
                } ${ativa ? 'border-cine-accent bg-cine-accent text-black' : 'border-cine-muted'}`}
                aria-hidden
              >
                {ativa && '✓'}
              </span>
              <span className={ativa ? 'text-cine-text' : 'text-cine-text/85'}>{o.texto}</span>
            </button>
          );
        })}
      </div>

      <ExplicarMelhor aberto={explicar} setAberto={setExplicar} valor={resposta?.comentario || ''} onChange={(comentario) => onChange({ ...resposta, option_ids: selecionadas, comentario })} />
    </div>
  );
}

export function ExplicarMelhor({
  aberto,
  setAberto,
  valor,
  onChange,
  rotulo = 'Quer explicar melhor? (opcional)',
  placeholder = 'Ex.: gosto de romance só quando os personagens são complexos…',
}) {
  return (
    <div className="mt-5">
      {!aberto ? (
        <button type="button" className="btn-fantasma -ml-3" onClick={() => setAberto(true)}>
          ✍️ Quer explicar melhor?
        </button>
      ) : (
        <label className="block">
          <span className="rotulo">{rotulo}</span>
          <textarea className="campo min-h-24 resize-y" maxLength={2000} placeholder={placeholder} value={valor} onChange={(e) => onChange(e.target.value)} />
        </label>
      )}
    </div>
  );
}
