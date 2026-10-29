// Rodapé obrigatório (aparece em todas as páginas, fazendo as vezes da página "Sobre"):
// o TMDB exige atribuição a ele e ao JustWatch (disponibilidade em streaming),
// e a política do Trakt exige a frase "CineMatch uses Trakt but is not endorsed or certified by Trakt".
export default function AttributionFooter() {
  return (
    <footer className="border-t border-cine-border/60 px-4 py-6 text-center text-xs text-cine-muted">
      Dados de filmes:{' '}
      <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="underline hover:text-cine-text">
        TMDB
      </a>
      . Disponibilidade em streaming:{' '}
      <a href="https://www.justwatch.com/br" target="_blank" rel="noreferrer" className="underline hover:text-cine-text">
        JustWatch
      </a>
      .
      <p className="mt-1 opacity-70">
        Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.
      </p>
      <p className="mt-1 opacity-70">
        Séries relacionadas:{' '}
        <a href="https://trakt.tv" target="_blank" rel="noreferrer" className="underline hover:text-cine-text">
          Trakt
        </a>
        . CineMatch uses Trakt but is not endorsed or certified by Trakt.
      </p>
    </footer>
  );
}
