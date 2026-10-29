import { useRef, useState } from 'react';

// Área de "arrastar e soltar" que também aceita clique para escolher o arquivo
export default function Dropzone({ onArquivo, desabilitado = false }) {
  const [sobre, setSobre] = useState(false);
  const input = useRef(null);

  const receber = (lista) => {
    const arquivo = lista?.[0];
    if (arquivo) onArquivo(arquivo);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={desabilitado}
      onClick={() => !desabilitado && input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !desabilitado && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        if (!desabilitado) receber(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
        sobre ? 'border-cine-accent bg-cine-accent/10' : 'border-cine-border hover:border-cine-muted hover:bg-cine-surface-2/40'
      } ${desabilitado ? 'pointer-events-none opacity-50' : ''}`}
    >
      <span className="text-5xl" aria-hidden>{sobre ? '📥' : '📄'}</span>
      <p className="font-semibold">Arraste o arquivo NetflixViewingHistory.csv para cá</p>
      <p className="text-sm text-cine-muted">ou clique para escolher no computador</p>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          receber(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
