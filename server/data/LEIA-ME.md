# server/data

## movielens.json.gz

Conhecimento extraído da base **MovieLens 32M** pela mineração de dados do CineMatch
(`npm run mineracao`, código em `scripts/mineracao/`). O servidor lê este arquivo ao iniciar.

O que tem dentro, para cada filme (identificado pelo ID do TMDB):
- `t`, `a`: título e ano (como estão no MovieLens);
- `c`: a família de gosto (cluster do k-means);
- `n`: quantas pessoas gostaram do filme;
- `v`: os 50 filmes mais parecidos, como `[id_tmdb, similaridade, confiança, lift]`.

Também traz as famílias de gosto (`clusters`), os parâmetros usados e o resultado da avaliação.
O relatório legível está em `docs/mineracao/relatorio.md`.

Se este arquivo for apagado, o app continua funcionando, só sem a filtragem colaborativa.

### Fonte, licença e citação

Dados: [MovieLens](https://grouplens.org/datasets/movielens/), do GroupLens Research (University of Minnesota).
Este arquivo é uma **versão transformada** da base e segue a mesma licença:
- uso apenas para fins **não comerciais** (pesquisa e uso pessoal), sem permissão do GroupLens para outros usos;
- o CineMatch **não é endossado** pela University of Minnesota nem pelo GroupLens;
- quem publicar resultados obtidos com estes dados deve citar:

> F. Maxwell Harper and Joseph A. Konstan. 2015. The MovieLens Datasets: History and Context.
> ACM Transactions on Interactive Intelligent Systems (TiiS) 5, 4: 19:1–19:19. https://doi.org/10.1145/2827872
