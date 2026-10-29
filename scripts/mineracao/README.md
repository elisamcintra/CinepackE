# Mineração de dados no CineMatch (MovieLens + KDD)

Este é o guia para entender, rodar e apresentar a mineração de dados do CineMatch.

## O problema

O CineMatch tem **um usuário só** (você). Com uma pessoa só, dá para descobrir o que **você** gosta,
mas não dá para descobrir "quem gosta do que você gosta também gosta de quê". Essa é a técnica que a Netflix,
a Amazon e o Spotify usam: a **filtragem colaborativa**.

A solução: aprender com o comportamento de **outras pessoas**. A base pública **MovieLens 32M**, do
GroupLens (University of Minnesota), tem 32 milhões de notas dadas por cerca de 200 mil pessoas. E cada filme
dela já traz o ID do TMDB, o mesmo usado pelo app, então dá para ligar uma base à outra sem adivinhar nomes.

## O processo: KDD em 5 etapas

KDD (*Knowledge Discovery in Databases*) é o roteiro clássico de mineração de dados. Cada etapa é um arquivo:

### 1. Seleção (`etapa1-selecao.js`)
Escolhe o que interessa. Lê `links.csv` (MovieLens → TMDB) e `movies.csv` (título, ano, gêneros).
Filmes sem ID do TMDB são descartados, porque o app não teria como reconhecê-los.
Também arruma os títulos: `"Matrix, The"` vira `"The Matrix"`.

### 2. Pré-processamento (`etapa2-preprocessamento.js`)
Limpa o ruído. Uma primeira leitura de `ratings.csv` (877 MB, lido em partes, sem carregar tudo na memória)
conta as notas de cada filme e de cada pessoa e calcula a média de cada pessoa.
- Filmes com menos de **500 notas** saem: há pouca informação sobre eles.
- Pessoas com menos de **20 notas** saem: dizem pouco sobre gosto.

### 3. Transformação (`etapa3-transformacao.js`)
Muda o formato dos dados para o que a mineração precisa. Cada pessoa vira uma **transação**: a lista de filmes
que ela **gostou**. "Gostou" é nota ≥ 4 **e** acima da média dela, porque uma pessoa que dá 5 para tudo
tem um "5" que vale menos. Quem avaliou milhares de filmes fica com os 200 de que mais gostou.

Aqui também separamos **2% das pessoas como conjunto de teste**. Elas não entram na mineração e servem
para medir, na etapa 5, se o que foi aprendido funciona com gente que o modelo nunca viu.

### 4. Mineração (`etapa4-mineracao.js`)
A etapa em que os padrões aparecem. São três técnicas:

**a) Coocorrência:** para cada par de filmes, quantas pessoas gostaram dos dois. Com ~6 mil filmes,
são ~19 milhões de pares, guardados numa tabela compacta (só metade dela, porque A+B = B+A).

**b) Regras de associação** (a ideia do algoritmo *Apriori*, com pares de filmes):

| Medida | Pergunta que responde | Exemplo |
|---|---|---|
| **Suporte** | Quantas pessoas, do total, gostaram de A e de B? | 1,2% de todo mundo |
| **Confiança** | De quem gostou de A, quantos % gostaram de B? | 63% |
| **Lift** | Essa ligação é quantas vezes mais forte que o acaso? | 26× (1 = puro acaso) |

O lift é o mais importante: "Um Sonho de Liberdade" tem confiança alta com quase tudo, porque quase todo mundo
gosta dele. O lift desconta essa popularidade e mostra a ligação de verdade.

**c) Similaridade item-item** (filtragem colaborativa):
`similaridade(A, B) = coocorrência ÷ √(curtidas_A × curtidas_B) × encolhimento`.
O encolhimento, `co ÷ (co + 20)`, reduz a nota de pares com poucas pessoas em comum, que podem ser coincidência.
Cada filme guarda os 50 mais parecidos.

**d) Clusterização k-means:** agrupa os filmes em 40 **famílias de gosto** pelo comportamento das pessoas,
sem olhar o gênero oficial. Cada filme vira um vetor numérico (soma de vetores aleatórios dos seus vizinhos,
pesados pelo lift) e o k-means junta os vetores próximos. Os nomes ("Drama + Crime") vêm dos gêneros mais
característicos de cada família.

### 5. Interpretação e avaliação (`etapa5-interpretacao.js`)
Confere se o conhecimento presta. Para até 3.000 pessoas do conjunto de teste, escondemos 20% dos filmes
que elas gostaram e pedimos 10 sugestões a partir do resto:

| Método | HitRate@10 | Precision@10 |
|---|---:|---:|
| Filtragem colaborativa (nossa mineração) | **70,9%** | **15,5%** |
| Só os filmes mais populares (comparação) | 49,6% | 8,6% |

- **HitRate@10:** em quantos % das pessoas pelo menos 1 das 10 sugestões era um filme escondido.
- **Precision@10:** dos 10 sugeridos, quantos % eram filmes escondidos.

A mineração acerta bem mais do que "sugerir o que todo mundo vê". Por fim, a etapa gera:
- `server/data/movielens.json.gz`: o arquivo que o app usa (3 MB);
- `docs/mineracao/relatorio.md`: os números de cada etapa, as regras mais fortes e as famílias, pronto para apresentar.

## Como o app usa o resultado

`server/services/movielensService.js` carrega o arquivo quando o servidor sobe. Então:
1. **Mais candidatos:** para cada filme que você ama, os 25 vizinhos minerados entram na disputa.
2. **Mais pontos:** um candidato ganha até 2,5 pontos pela soma das similaridades com seus favoritos.
3. **Motivo explicado:** "63% de quem amou "Por um Punhado de Dólares" também amou este…".
4. **Página Meu gosto:** mostra as regras dos seus favoritos e as suas famílias de gosto.

A verificação da Netflix Brasil continua obrigatória: o MovieLens só sugere, nunca garante disponibilidade.
Séries não estão no MovieLens e continuam vindo do TMDB e da IA.

## Como rodar

```bash
npm run mineracao:baixar        # baixa a base completa (~240 MB) para dados/movielens/bruto/
npm run mineracao               # as 5 etapas (~1 minuto)
npm run mineracao -- --etapa=4  # só uma etapa (as anteriores precisam já ter rodado)
npm run mineracao:teste         # tudo com a base pequena (~1 MB), em segundos
```

Os parâmetros (limiares, quantidade de famílias, semente do sorteio) estão comentados em `config.js`.
Com a mesma semente, rodar de novo dá exatamente o mesmo resultado.

Pastas:
```
dados/movielens/bruto/        CSVs originais (fora do Git: são grandes)
dados/movielens/processado/   saídas intermediárias de cada etapa
server/data/                  resultado usado pelo app (vai para o Git)
docs/mineracao/relatorio.md   relatório gerado
```

## Licença e citação
Uso não comercial; o CineMatch não é endossado pelo GroupLens. Detalhes em `server/data/LEIA-ME.md`.

> F. Maxwell Harper and Joseph A. Konstan. 2015. The MovieLens Datasets: History and Context.
> ACM Transactions on Interactive Intelligent Systems (TiiS) 5, 4: 19:1–19:19. https://doi.org/10.1145/2827872

## Melhorias testadas (Fase 2)

Cada melhoria foi medida no conjunto de **validação** e conferida uma vez no **teste**, com critérios fixados antes
(ver `docs/avaliacao/PROTOCOLO.md`). Entraram: base completa (sem limite de favoritos), **conteúdo do TMDB e das tags**
misturado à similaridade (γ = 0,35) e **EASE** para quem tem 20+ filmes. Ficaram de fora, com os números do porquê:
cosseno assimétrico, EASE para todos, notas com sinal negativo, recência e Tag Genome. Tudo em
`docs/mineracao/experimentos.md` e `docs/avaliacao/RESULTADOS.md`.

Arquivos novos: `similaridade.js` (item-item, EASE e mistura com conteúdo), `conteudo.js` (TF-IDF do TMDB e das tags,
genome), `avaliacao.js` (métricas, inclusive NDCG, popularidade, cobertura e cold start), `experimentos.js` e
`baixar-conteudo.js`.
