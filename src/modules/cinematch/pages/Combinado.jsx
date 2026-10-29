import { Link } from 'react-router';

// Caminho 3: Histórico + Quiz. Explica os 2 passos e começa pelo histórico.
export default function Combinado() {
  return (
    <section className="mx-auto max-w-2xl py-6 text-center">
      <span className="rounded-full bg-cine-accent px-3 py-1 text-xs font-bold uppercase tracking-wider text-black">Recomendado</span>
      <h1 className="mt-4 font-display text-5xl tracking-wide">Histórico + Quiz</h1>
      <p className="mt-3 text-cine-muted">
        O histórico mostra o que você <strong className="text-cine-text">realmente assiste</strong>. O quiz mostra o que você{' '}
        <strong className="text-cine-text">diz gostar</strong> e as nuances. Juntos, eles dão as recomendações mais certeiras, e a IA ainda
        percebe contradições, como "diz que odeia romance, mas viu vários romances europeus".
      </p>

      <ol className="mx-auto mt-10 grid max-w-lg gap-3 text-left">
        <li className="cartao flex items-center gap-4 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cine-accent font-bold text-black">1</span>
          <span>
            <strong>Histórico da Netflix</strong>
            <span className="block text-sm text-cine-muted">Baixe o arquivo, envie e avalie rapidinho os principais.</span>
          </span>
        </li>
        <li className="cartao flex items-center gap-4 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cine-surface-2 font-bold">2</span>
          <span>
            <strong>Quiz de 10 perguntas</strong>
            <span className="block text-sm text-cine-muted">A pergunta 10 já sugere os títulos que você marcou com ❤️.</span>
          </span>
        </li>
      </ol>

      <Link to="/cinematch/historico?modo=combinado" className="btn-primario mt-10 px-8 py-3 text-lg">
        Começar pelo histórico →
      </Link>
    </section>
  );
}
