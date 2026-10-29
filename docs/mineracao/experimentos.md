# Experimentos do MovieLens: antes × depois

Gerado em 27/10/2026, 14:10:32 por `npm run mineracao:experimentos` (1min 18s).

Protocolo: variações medidas na **validação**; a escolhida é conferida **uma vez** no **teste** (as mesmas 3.000 pessoas e a mesma semente da linha de base). Critérios A5, A6 e A10 aprovados antes da implementação.

## Linha de base (teste)

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| App antigo (12 favoritos) | 73,0% | 17,4% | 20,0% | 0,2606 | top 1,2% | 11,6% |
| B0′: modelo original, todas as curtidas | 75,1% | 20,6% | 21,9% | 0,2964 | top 1,0% | 9,0% |
| Só os mais populares | 53,5% | 11,1% | 10,9% | 0,1515 | top 0,2% | 1,6% |

## M1: Base completa (todos os títulos, sem limite de 12 favoritos)

**Decisão:** ✅ aceita

Validação:

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 72,4% | 17,0% | 19,9% | 0,2591 | top 1,2% | 11,3% |
| {limiteBase:0} ✔ | 75,5% | 20,3% | 22,0% | 0,2951 | top 1,0% | 8,9% |

Teste (antes × depois):

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 73,0% | 17,4% | 20,0% | 0,2606 | top 1,2% | 11,6% |
| depois | 75,1% | 20,6% | 21,9% | 0,2964 | top 1,0% | 9,0% |

## M2: Viés de popularidade (cosseno assimétrico, α)

**Decisão:** ❌ não entrou (revertida no teste (A6: cold start com 20 títulos piorou))

Validação:

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 75,5% | 20,3% | 22,0% | 0,2951 | top 1,0% | 8,9% |
| {alfa:0.55} ✔ | 75,5% | 20,8% | 22,3% | 0,3022 | top 1,3% | 10,5% |
| {alfa:0.6} ✔ | 76,3% | 21,2% | 22,7% | 0,3056 | top 1,7% | 12,6% |
| {alfa:0.7} ✖ | 75,1% | 20,6% | 21,8% | 0,2904 | top 3,0% | 17,6% |
| {alfa:0.8} ✖ | 69,6% | 16,7% | 17,8% | 0,2305 | top 5,9% | 23,6% |

Teste (antes × depois):

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 75,1% | 20,6% | 21,9% | 0,2964 | top 1,0% | 9,0% |
| depois | 77,0% | 21,5% | 22,8% | 0,3084 | top 1,7% | 12,8% |

## M3: Intensidade das notas e sinal negativo; EASE

**Decisão:** ❌ não entrou (revertida no teste (A6: com 5 títulos não supera "mais populares"))

Validação:

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 75,5% | 20,3% | 22,0% | 0,2951 | top 1,0% | 8,9% |
| {pesoUsuario:notas} ✖ | 73,9% | 19,8% | 20,7% | 0,2836 | top 1,1% | 11,6% |
| {modelo:ease,easeLambda:500} ✔ | 83,7% | 27,4% | 29,4% | 0,3918 | top 2,6% | 19,6% |
| {modelo:ease,easeLambda:500,pesoUsuario:notas} ✔ | 83,3% | 26,7% | 28,5% | 0,3817 | top 2,7% | 21,3% |
| {modelo:ease,easeLambda:2000} ✔ | 83,8% | 27,1% | 29,2% | 0,3882 | top 2,2% | 16,6% |
| {modelo:ease,easeLambda:2000,pesoUsuario:notas} ✔ | 82,7% | 26,4% | 28,1% | 0,3782 | top 2,2% | 17,6% |

Teste (antes × depois):

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 75,1% | 20,6% | 21,9% | 0,2964 | top 1,0% | 9,0% |
| depois | 83,9% | 27,8% | 29,1% | 0,3936 | top 2,6% | 20,3% |

## M4: Recência (notas da pessoa e pessoas da mineração)

**Decisão:** ❌ não entrou (nenhuma variação cumpriu a regra na validação)

Validação:

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 75,5% | 20,3% | 22,0% | 0,2951 | top 1,0% | 8,9% |
| {meiaVidaUsuarioDias:730} ✖ | 75,4% | 20,3% | 21,9% | 0,2949 | top 1,0% | 8,9% |
| {meiaVidaPessoaDias:1825} ✖ | 74,9% | 20,2% | 21,7% | 0,2938 | top 1,0% | 8,9% |
| {meiaVidaUsuarioDias:730,meiaVidaPessoaDias:1825} ✖ | 75,0% | 20,2% | 21,7% | 0,2934 | top 1,0% | 8,9% |

## M5: Conteúdo do TMDB (palavras-chave, direção, elenco, coleção)

**Decisão:** ✅ aceita

Validação:

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 75,5% | 20,3% | 22,0% | 0,2951 | top 1,0% | 8,9% |
| {conteudo:[tmdb],gamaConteudo:0.1} ✖ | 75,4% | 20,4% | 22,0% | 0,2968 | top 1,0% | 9,0% |
| {conteudo:[tmdb],gamaConteudo:0.2} ✔ | 75,7% | 20,6% | 22,1% | 0,2991 | top 1,0% | 9,3% |
| {conteudo:[tmdb],gamaConteudo:0.35} ✔ | 76,1% | 20,7% | 22,3% | 0,3019 | top 1,1% | 10,1% |

Teste (antes × depois):

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 75,1% | 20,6% | 21,9% | 0,2964 | top 1,0% | 9,0% |
| depois | 75,8% | 21,0% | 22,3% | 0,3027 | top 1,1% | 10,2% |

## M6a: Conteúdo: tags do MovieLens

**Decisão:** ✅ aceita

Validação:

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 76,1% | 20,7% | 22,3% | 0,3019 | top 1,1% | 10,1% |
| {conteudo:[tmdb,tags],gamaConteudo:0.1} ✖ | 75,4% | 20,5% | 22,1% | 0,2978 | top 1,0% | 9,0% |
| {conteudo:[tmdb,tags],gamaConteudo:0.2} ✖ | 75,8% | 20,5% | 22,2% | 0,2996 | top 1,0% | 9,3% |
| {conteudo:[tmdb,tags],gamaConteudo:0.35} ✔ | 76,4% | 20,8% | 22,5% | 0,3045 | top 1,1% | 10,1% |

Teste (antes × depois):

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 75,8% | 21,0% | 22,3% | 0,3027 | top 1,1% | 10,2% |
| depois | 75,9% | 21,2% | 22,6% | 0,3054 | top 1,1% | 10,1% |

## M6b: Conteúdo: Tag Genome (MovieLens 25M)

**Decisão:** ❌ não entrou (nenhuma variação cumpriu a regra na validação)

Validação:

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 76,4% | 20,8% | 22,5% | 0,3045 | top 1,1% | 10,1% |
| {conteudo:[tmdb,tags,genome],gamaConteudo:0.1} ✖ | 75,5% | 20,5% | 22,0% | 0,2979 | top 1,0% | 9,0% |
| {conteudo:[tmdb,tags,genome],gamaConteudo:0.2} ✖ | 76,0% | 20,6% | 22,2% | 0,3007 | top 1,0% | 9,4% |
| {conteudo:[tmdb,tags,genome],gamaConteudo:0.35} ✖ | 76,3% | 20,9% | 22,5% | 0,3052 | top 1,1% | 10,4% |

## M3b: Modelo por tamanho da base: EASE para quem tem ≥ 20 títulos (variação criada DEPOIS de ver o teste da M3: o resultado no teste é otimista)

**Decisão:** ✅ aceita

Validação:

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 76,4% | 20,8% | 22,5% | 0,3045 | top 1,1% | 10,1% |
| {easeAPartirDe:20,easeLambda:500} ✔ | 79,9% | 26,5% | 26,6% | 0,3699 | top 1,8% | 15,8% |
| {easeAPartirDe:20,easeLambda:2000} ✔ | 79,8% | 26,3% | 26,4% | 0,3669 | top 1,7% | 14,1% |

Teste (antes × depois):

| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| antes | 75,9% | 21,2% | 22,6% | 0,3054 | top 1,1% | 10,1% |
| depois | 80,3% | 26,9% | 26,5% | 0,3721 | top 1,9% | 16,5% |

## Cold start (teste): linha de base × configuração final

| Títulos | HitRate B0′ | HitRate final | NDCG B0′ | NDCG final | Popularidade final | Cobertura final |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 32,7% | 31,5% | 0,0414 | 0,0404 | top 9,5% | 40,0% |
| 3 | 40,7% | 39,7% | 0,0580 | 0,0558 | top 4,1% | 22,4% |
| 5 | 43,8% | 43,7% | 0,0647 | 0,0631 | top 2,4% | 15,8% |
| 10 | 48,0% | 49,1% | 0,0712 | 0,0723 | top 1,2% | 9,0% |
| 20 | 51,9% | 52,5% | 0,0786 | 0,0845 | top 3,2% | 16,1% |
| 40 | 56,1% | 62,7% | 0,0977 | 0,1252 | top 2,2% | 12,7% |
| mais populares | 40,6% | | 0,0603 | | | |

## Configuração final

```json
{
  "modelo": "item-item",
  "alfa": 0.5,
  "easeLambda": 500,
  "easeAPartirDe": 20,
  "pesoUsuario": "binario",
  "meiaVidaUsuarioDias": 0,
  "meiaVidaPessoaDias": 0,
  "conteudo": [
    "tmdb",
    "tags"
  ],
  "gamaConteudo": 0.35,
  "limiteBase": 0
}
```

