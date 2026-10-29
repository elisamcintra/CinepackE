// Seletor de "humor do dia": 15 segundos para ajustar as recomendações na hora
export const TEMPOS = [
  { id: 'ate_1h30', texto: 'Até 1h30' },
  { id: 'ate_2h', texto: 'Até 2h' },
  { id: 'maratona', texto: 'Maratona' },
];
export const CLIMAS = [
  { id: 'leve', texto: '☀️ Leve' },
  { id: 'intenso', texto: '⚡ Intenso' },
  { id: 'pensar', texto: '🧠 Para pensar' },
  { id: 'rir', texto: '😂 Para rir' },
  { id: 'chorar', texto: '😭 Para chorar' },
];

export default function MoodPicker({ tempo, clima, onChange }) {
  return (
    <div className="cartao flex flex-col gap-4 p-4 md:flex-row md:items-center md:gap-8">
      <Grupo rotulo="Quanto tempo você tem?" opcoes={TEMPOS} valor={tempo} onEscolher={(v) => onChange({ tempo: v, clima })} />
      <Grupo rotulo="Que clima?" opcoes={CLIMAS} valor={clima} onEscolher={(v) => onChange({ tempo, clima: v })} />
      {(tempo || clima) && (
        <button className="btn-fantasma self-start md:ml-auto md:self-center" onClick={() => onChange({ tempo: null, clima: null })}>
          Limpar
        </button>
      )}
    </div>
  );
}

function Grupo({ rotulo, opcoes, valor, onEscolher }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-cine-muted">{rotulo}</legend>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <button key={o.id} type="button" aria-pressed={valor === o.id} className={`chip ${valor === o.id ? 'chip-ativo' : ''}`} onClick={() => onEscolher(valor === o.id ? null : o.id)}>
            {o.texto}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
