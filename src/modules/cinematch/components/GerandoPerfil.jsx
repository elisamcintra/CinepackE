import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ErrorState } from '../../../shared/ui/States.jsx';
import { cmApi } from '../lib/api.js';

const FRASES = [
  'Lendo suas respostas…',
  'Cruzando com o que você já assistiu…',
  'Encontrando nuances no seu gosto…',
  'Separando gêneros favoritos e o que evitar…',
  'Quase lá: preparando o seu catálogo…',
];

// Tela "Montando seu perfil…": gera o perfil no servidor e vai para o Dashboard
export default function GerandoPerfil({ destino = '/cinematch/app/para-voce' }) {
  const navigate = useNavigate();
  const [frase, setFrase] = useState(0);
  const [erro, setErro] = useState(null);
  const [tentativa, setTentativa] = useState(0);
  const iniciou = useRef(-1);

  useEffect(() => {
    const t = setInterval(() => setFrase((f) => (f + 1) % FRASES.length), 2200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // Evita gerar duas vezes (o React em modo de desenvolvimento roda efeitos duas vezes)
    if (iniciou.current === tentativa) return;
    iniciou.current = tentativa;
    setErro(null);
    cmApi
      .gerarPerfil()
      .then(() => navigate(destino, { replace: true }))
      .catch((e) => setErro(e.message));
  }, [tentativa, destino, navigate]);

  if (erro) {
    return (
      <div className="py-16">
        <ErrorState mensagem={`Não conseguimos montar seu perfil: ${erro}`} onTentar={() => setTentativa((n) => n + 1)} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 text-center" role="status" aria-live="polite">
      {/* Rolo de filme girando */}
      <div className="relative h-28 w-28 animate-[rolo_2.4s_linear_infinite] rounded-full border-4 border-cine-accent/80">
        {[0, 60, 120, 180, 240, 300].map((g) => (
          <span
            key={g}
            className="absolute left-1/2 top-1/2 h-6 w-6 rounded-full bg-cine-accent/80"
            style={{ transform: `translate(-50%, -50%) rotate(${g}deg) translateY(-30px)` }}
          />
        ))}
        <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cine-accent" />
      </div>
      <div>
        <h1 className="font-display text-4xl tracking-wide">Montando seu perfil…</h1>
        <p key={frase} className="mt-2 animate-[subir_.4s_ease-out] text-cine-muted">
          {FRASES[frase]}
        </p>
      </div>
    </div>
  );
}
