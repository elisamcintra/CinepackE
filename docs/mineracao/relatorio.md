# Relatório de mineração de dados: MovieLens → CineMatch

Gerado em 27/10/2026, 14:11:21 a partir de **MovieLens 32M: 32 milhões de notas de ~200 mil pessoas (coletadas até 10/2023)**.

Processo seguido: **KDD** (*Knowledge Discovery in Databases*), em 5 etapas. Os scripts estão em `scripts/mineracao/`.

## 1. Seleção
- Filmes no catálogo do MovieLens: **87.585**
- Com ID do TMDB (que o CineMatch reconhece): **87.461**; descartados sem ID: 124

## 2. Pré-processamento (limpeza)
- Notas lidas: **32.000.204** de **200.948** pessoas
- Pessoas mantidas (≥ 20 notas): **200.948**; removidas: 0
- Filmes mantidos (≥ 500 notas): **6.223**; removidos por poucas notas: 78.087

## 3. Transformação
- Cada pessoa vira uma *transação*: os filmes que ela **gostou** (nota ≥ 4 e ≥ a média dela), no máximo 200.
- Transações de treino: **192.423**; de teste (separadas para avaliação, 2%): **4.007**
- Curtidas no total: 11.825.665 (média de 60,2 por pessoa)

## 4. Mineração
- Pares de filmes contados: **636.182.753**
- **Regras de associação** encontradas (coocorrência ≥ 30, confiança ≥ 20%, lift ≥ 1,5): **467.291**
- **Similaridade item-item** (filtragem colaborativa): 50 filmes mais parecidos guardados para cada filme
- **Clusterização k-means**: 40 famílias de gosto

### Regras mais fortes (suporte ≥ 1%, confiança ≥ 50%, ordenadas por lift)

| Se gostou de… | …também gostou de | Suporte | Confiança | Lift |
|---|---|---:|---:|---:|
| The Hobbit: The Battle of the Five Armies (2014) | The Hobbit: The Desolation of Smaug (2013) | 1,1% | 72,8% | 30,9 |
| Three Colors: White (Trzy kolory: Bialy) (1994) | Three Colors: Blue (Trois couleurs: Bleu) (1993) | 1,1% | 70,0% | 30,3 |
| Three Colors: White (Trzy kolory: Bialy) (1994) | Three Colors: Red (Trois couleurs: Rouge) (1994) | 1,2% | 72,3% | 27,5 |
| A Fistful of Dollars (Per un pugno di dollari) (1964) | For a Few Dollars More (Per qualche dollaro in più) (1965) | 1,2% | 50,5% | 26,3 |
| For a Few Dollars More (Per qualche dollaro in più) (1965) | A Fistful of Dollars (Per un pugno di dollari) (1964) | 1,2% | 63,3% | 26,3 |
| Before Sunset (2004) | Before Sunrise (1995) | 1,2% | 62,8% | 25,9 |
| Three Colors: Red (Trois couleurs: Rouge) (1994) | Three Colors: Blue (Trois couleurs: Bleu) (1993) | 1,5% | 58,7% | 25,5 |
| Three Colors: Blue (Trois couleurs: Bleu) (1993) | Three Colors: Red (Trois couleurs: Rouge) (1994) | 1,5% | 66,8% | 25,5 |
| John Wick: Chapter Two (2017) | John Wick (2014) | 1,3% | 78,5% | 24,8 |
| Iron Man 3 (2013) | Iron Man 2 (2010) | 1,0% | 54,7% | 22,9 |
| The Hobbit: The Battle of the Five Armies (2014) | The Hobbit: An Unexpected Journey (2012) | 1,2% | 74,6% | 22,7 |
| The Hobbit: An Unexpected Journey (2012) | The Hobbit: The Desolation of Smaug (2013) | 1,7% | 52,4% | 22,2 |
| The Hobbit: The Desolation of Smaug (2013) | The Hobbit: An Unexpected Journey (2012) | 1,7% | 72,9% | 22,2 |
| Laputa: Castle in the Sky (Tenkû no shiro Rapyuta) (1986) | Nausicaä of the Valley of the Wind (Kaze no tani no Naushika) (1984) | 1,2% | 52,9% | 22,2 |
| Nausicaä of the Valley of the Wind (Kaze no tani no Naushika) (1984) | Laputa: Castle in the Sky (Tenkû no shiro Rapyuta) (1986) | 1,2% | 51,8% | 22,2 |
| Dr. No (1962) | Goldfinger (1964) | 1,0% | 62,6% | 20,6 |
| The Hunger Games: Mockingjay - Part 1 (2014) | The Hunger Games (2012) | 1,0% | 70,0% | 20,4 |
| From Russia with Love (1963) | Goldfinger (1964) | 1,0% | 60,6% | 19,9 |
| Captain America: Civil War (2016) | Captain America: The Winter Soldier (2014) | 1,3% | 56,1% | 19,9 |
| Star Trek VI: The Undiscovered Country (1991) | Star Trek IV: The Voyage Home (1986) | 1,0% | 55,0% | 19,7 |

### Exemplos: filmes mais parecidos (segundo o comportamento das pessoas)

- **Inception (2010)** → The Dark Knight (2008) (0,40), Interstellar (2014) (0,38), The Dark Knight Rises (2012) (0,35), The Prestige (2006) (0,33), Shutter Island (2010) (0,33)
- **The Matrix (1999)** → The Matrix Reloaded (2003) (0,36), The Lord of the Rings: The Fellowship of the Ring (2001) (0,36), Fight Club (1999) (0,35), The Lord of the Rings: The Two Towers (2002) (0,34), Star Wars: Episode IV - A New Hope (1977) (0,33)
- **Pulp Fiction (1994)** → Reservoir Dogs (1992) (0,41), The Usual Suspects (1995) (0,37), The Silence of the Lambs (1991) (0,36), The Shawshank Redemption (1994) (0,35), Fight Club (1999) (0,35)
- **Spirited Away (Sen to Chihiro no kamikakushi) (2001)** → Howl's Moving Castle (Hauru no ugoku shiro) (2004) (0,42), Princess Mononoke (Mononoke-hime) (1997) (0,40), My Neighbor Totoro (Tonari no Totoro) (1988) (0,38), Laputa: Castle in the Sky (Tenkû no shiro Rapyuta) (1986) (0,31), Nausicaä of the Valley of the Wind (Kaze no tani no Naushika) (1984) (0,30)
- **Forrest Gump (1994)** → The Shawshank Redemption (1994) (0,38), Schindler's List (1993) (0,32), Braveheart (1995) (0,32), The Silence of the Lambs (1991) (0,30), Pulp Fiction (1994) (0,30)
- **Interstellar (2014)** → Inception (2010) (0,38), The Martian (2015) (0,34), The Dark Knight Rises (2012) (0,30), The Dark Knight (2008) (0,29), The Prestige (2006) (0,28)
- **The Dark Knight (2008)** → Batman Begins (2005) (0,47), The Dark Knight Rises (2012) (0,46), Inception (2010) (0,40), The Prestige (2006) (0,33), Fight Club (1999) (0,30)
- **The Lord of the Rings: The Fellowship of the Ring (2001)** → The Lord of the Rings: The Two Towers (2002) (0,73), The Lord of the Rings: The Return of the King (2003) (0,69), The Matrix (1999) (0,36), Star Wars: Episode V - The Empire Strikes Back (1980) (0,32), Star Wars: Episode IV - A New Hope (1977) (0,31)

### Famílias de gosto (k-means)

| # | Família | Filmes | Exemplos |
|---:|---|---:|---|
| 35 | Drama + Crime | 223 | The Shawshank Redemption, Forrest Gump, The Matrix |
| 39 | Comédia | 215 | The Princess Bride, Ferris Bueller's Day Off, Willy Wonka & the Chocolate Factory |
| 9 | Drama + Romance | 213 | It's a Wonderful Life, Gone with the Wind, The English Patient |
| 31 | Romance + Comédia | 203 | The Notebook, Mean Girls, The Blind Side |
| 15 | Drama + Crime | 198 | The Dark Knight, Inception, Interstellar |
| 30 | Drama | 196 | Ran, The Seventh Seal (Sjunde inseglet, Det), Rashomon (Rashômon) |
| 16 | Drama + Ação | 195 | Casablanca, Rear Window, 12 Angry Men |
| 4 | Drama + Crime | 191 | Pulp Fiction, The Silence of the Lambs, Schindler's List |
| 29 | Romance + Comédia | 190 | The Maltese Falcon, Some Like It Hot, Singin' in the Rain |
| 13 | Ficção científica + Ação | 187 | Star Wars: Episode IV - A New Hope, Star Wars: Episode V - The Empire Strikes Back, Raiders of the Lost Ark (Indiana Jones and the Raiders of the Lost Ark) |
| 11 | Infantil + Animação | 172 | The Wizard of Oz, The Nightmare Before Christmas, The Sound of Music |
| 24 | Ação + Ficção científica | 172 | Iron Man, The Dark Knight Rises, Toy Story 2 |
| 7 | Ação + Aventura | 170 | Avengers: Infinity War - Part I, Spider-Man: Into the Spider-Verse, Thor: Ragnarok |
| 21 | Ação + Suspense | 170 | Braveheart, Toy Story, The Rock |
| 17 | Drama + Comédia | 164 | When Harry Met Sally..., Shakespeare in Love, As Good as It Gets |
| 20 | Terror + Suspense | 164 | Get Out, Knives Out, The Cabin in the Woods |
| 0 | Drama | 163 | There Will Be Blood, Before Sunset, The Secret in Their Eyes (El secreto de sus ojos) |
| 6 | Drama | 163 | Parasite, Joker, 1917 |
| 34 | Romance + Comédia | 162 | The Others, 10 Things I Hate About You, Notting Hill |
| 12 | Terror + Suspense | 158 | The Exorcist, The Thing, Army of Darkness |
| 26 | Ação + Comédia | 158 | The Hangover, Meet the Parents, Anchorman: The Legend of Ron Burgundy |
| 22 | Drama + Romance | 150 | Sense and Sensibility, Dead Man Walking, Leaving Las Vegas |
| 8 | Drama + Romance | 149 | Before Sunrise, Amores Perros (Love's a Bitch), Sideways |
| 18 | Animação + Infantil | 147 | WALL·E, Up, Ratatouille |
| 33 | Drama | 145 | Mulholland Drive, Pi, Metropolis |
| 1 | Ação + Suspense | 144 | District 9, Moon, Zombieland |
| 38 | Aventura + Fantasia | 142 | The Lord of the Rings: The Return of the King, Batman Begins, The Incredibles |
| 23 | Ação + Suspense | 136 | Jurassic Park, The Fugitive, Apollo 13 |
| 27 | Terror + Suspense | 136 | Scream, The Blair Witch Project, Dracula (Bram Stoker's Dracula) |
| 5 | Romance + Drama | 130 | Monsters, Inc., Babe, Pretty Woman |
| 32 | Ficção científica + Suspense | 129 | Planet of the Apes, The Rocky Horror Picture Show, Being There |
| 37 | Comédia | 126 | Superbad, Manhattan, Sleeper |
| 14 | Drama | 122 | Donnie Darko, Shaun of the Dead, Slumdog Millionaire |
| 10 | Terror + Suspense | 121 | The Ring, Tommy Boy, Saw |
| 36 | Drama + Romance | 112 | Juno, (500) Days of Summer, Stranger than Fiction |
| 2 | Comédia + Romance | 110 | Independence Day (a.k.a. ID4), Titanic, Jerry Maguire |
| 19 | Drama | 110 | Little Miss Sunshine, Big Fish, Love Actually |
| 3 | Drama + Comédia | 97 | The Pursuit of Happyness, Remember the Titans, Bruce Almighty |
| 28 | Animação + Fantasia | 97 | Spirited Away (Sen to Chihiro no kamikakushi), Princess Mononoke (Mononoke-hime), Howl's Moving Castle (Hauru no ugoku shiro) |
| 25 | Comédia + Suspense | 93 | The Craft, 101 Dalmatians, The Frighteners |

## 5. Interpretação e avaliação

Avaliação offline com **3.000 pessoas de teste** (que não participaram da mineração).
Para cada uma, escondemos 20% dos filmes que ela gostou e pedimos 10 recomendações a partir do resto.

Modelo: **item-item** (α = 0.5), conteúdo tmdb + tags (γ = 0.35); pesos da pessoa: binario.

| Método | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição média de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| Filtragem colaborativa (minerada) | **80,3%** | 26,9% | 26,5% | 0,3721 | top 1,9% | 16,5% |
| Baseline: só os mais populares | 53,5% | 11,1% | 10,9% | 0,1515 | top 0,2% | 1,6% |

### Cold start: acerto conforme o número de títulos que a pessoa já avaliou

| Títulos na base | HitRate@10 | NDCG@10 | Posição média de popularidade | Cobertura |
|---:|---:|---:|---:|---:|
| 1 | 31,5% | 0,0404 | top 9,5% | 40,0% |
| 3 | 39,7% | 0,0558 | top 4,1% | 22,4% |
| 5 | 43,7% | 0,0631 | top 2,4% | 15,8% |
| 10 | 49,1% | 0,0723 | top 1,2% | 9,0% |
| 20 | 52,5% | 0,0845 | top 3,2% | 16,1% |
| 40 | 62,7% | 0,1252 | top 2,2% | 12,7% |
| mais populares | 40,6% | 0,0603 | top 0,1% | 0,4% |

**Conclusão:** as recomendações mineradas acertam **2,4x mais** que recomendar só os filmes populares (Precision@10).

## Como o CineMatch usa isso
- Os vizinhos dos seus filmes favoritos viram **candidatos** a recomendação (sempre verificados na Netflix Brasil).
- Cada candidato ganha pontos pela **similaridade** com os seus favoritos; o motivo mostra a **confiança** ("62% de quem amou X também amou este").
- A página **Meu gosto** mostra as regras dos seus favoritos e as suas famílias de gosto.

## Glossário
- **Suporte:** % de todas as pessoas que gostaram dos dois filmes.
- **Confiança (A ⇒ B):** das pessoas que gostaram de A, quantas % também gostaram de B.
- **Lift:** quantas vezes a relação é mais forte que o acaso (1 = acaso; 3 = três vezes mais provável).
- **Similaridade de cosseno:** de 0 a 1, o quanto dois filmes são curtidos pelas mesmas pessoas.
- **k-means:** algoritmo que separa itens em k grupos de itens parecidos entre si.
- **HitRate / Precision / Recall @10:** medidas de acerto das 10 primeiras recomendações.
- **NDCG@10:** como o Precision, mas acertar no 1º lugar vale mais que no 10º (0 a 1).
- **Posição média de popularidade:** onde os recomendados ficam no ranking dos mais curtidos (top 0,9% = quase só sucessos).
- **Cobertura:** quantos % dos filmes aparecem em alguma recomendação (baixa = sempre os mesmos).

## Fonte e licença
Dados: MovieLens (GroupLens Research, Universidade de Minnesota), usados para fins não comerciais. Citação: F. Maxwell Harper and Joseph A. Konstan. 2015. The MovieLens Datasets: History and Context. ACM Transactions on Interactive Intelligent Systems (TiiS) 5, 4: 19:1–19:19. https://doi.org/10.1145/2827872
Este projeto não é endossado pela Universidade de Minnesota nem pelo GroupLens.
