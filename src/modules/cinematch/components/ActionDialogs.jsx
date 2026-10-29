import { useState } from 'react';
import Modal from '../../../shared/ui/Modal.jsx';
import RatingStars from './RatingStars.jsx';

// "✅ Já vi": pede uma nota de 1 a 5 (opcional)
export function RateDialog({ titulo, onConfirmar, onFechar }) {
  const [nota, setNota] = useState(0);
  return (
    <Modal aberto={!!titulo} onFechar={onFechar} titulo={`Que nota você dá para "${titulo?.titulo}"?`}>
      <div className="flex flex-col items-center gap-6 py-2">
        <RatingStars valor={nota} onChange={setNota} tamanho="text-4xl" />
        <p className="text-center text-sm text-cine-muted">Sua nota ajuda o CineMatch a entender melhor o seu gosto.</p>
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-fantasma" onClick={() => onConfirmar(null)}>
            Pular nota
          </button>
          <button className="btn-primario" disabled={!nota} onClick={() => onConfirmar(nota)}>
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

const MOTIVOS = ['Não curto o gênero', 'Parece lento', 'Já tentei e larguei'];

// "🚫 Não me interessa": motivo opcional com chips
export function NotInterestedDialog({ titulo, onConfirmar, onFechar }) {
  const [motivo, setMotivo] = useState(null);
  const [outro, setOutro] = useState('');
  const final = motivo === 'outro' ? outro.trim() || null : motivo;

  return (
    <Modal aberto={!!titulo} onFechar={onFechar} titulo={`Por que "${titulo?.titulo}" não te interessa?`}>
      <p className="-mt-2 mb-4 text-sm text-cine-muted">Opcional, mas ajuda a acertar mais nas próximas.</p>
      <div className="flex flex-wrap gap-2">
        {MOTIVOS.map((m) => (
          <button key={m} className={`chip ${motivo === m ? 'chip-ativo' : ''}`} onClick={() => setMotivo(motivo === m ? null : m)}>
            {m}
          </button>
        ))}
        <button className={`chip ${motivo === 'outro' ? 'chip-ativo' : ''}`} onClick={() => setMotivo(motivo === 'outro' ? null : 'outro')}>
          Outro…
        </button>
      </div>
      {motivo === 'outro' && (
        <input autoFocus className="campo mt-3" placeholder="Conte rapidinho" value={outro} onChange={(e) => setOutro(e.target.value)} maxLength={200} />
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-fantasma" onClick={onFechar}>
          Cancelar
        </button>
        <button className="btn-primario" onClick={() => onConfirmar(final)}>
          Confirmar
        </button>
      </div>
    </Modal>
  );
}
