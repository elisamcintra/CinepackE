# Resultados das melhorias do MovieLens (Fase 2, 27/10/2026)

Protocolo e critérios: [PROTOCOLO.md](PROTOCOLO.md) (fixados antes da implementação).
Detalhe de cada variação: [docs/mineracao/experimentos.md](../mineracao/experimentos.md).
As listas com os títulos da usuária ficam em `dados/avaliacao/` (fora do Git).

## 1. Offline (componente MovieLens, 3.000 pessoas de teste, semente 43)

| Melhoria | Decisão | NDCG@10 no teste (antes → depois) | Motivo |
|---|---|---|---|
| M1 Base completa (sem limite de 12) | ✅ aceita | 0,2606 → 0,2964 | melhora em tudo |
| M2 Viés de popularidade (α = 0,6) | ❌ revertida | 0,2964 → 0,3084 | A6: com 20 títulos, HitRate 51,9% → 51,5% |
| M3 EASE (λ = 500) para todos | ❌ revertida | 0,2964 → 0,3936 | A6: com 5 títulos, 39,4% < 40,6% dos "mais populares" |
| M3 Notas com peso e sinal negativo | ❌ não entrou | — | piora na validação (0,2951 → 0,2836) |
| M4 Recência (pessoa e mineração) | ❌ não entrou | — | nenhuma variação melhorou na validação |
| M5 Conteúdo do TMDB (γ = 0,35) | ✅ aceita | 0,2964 → 0,3027 | melhora |
| M6a Tags do MovieLens (γ = 0,35) | ✅ aceita | 0,3027 → 0,3054 | melhora |
| M6b Tag Genome | ❌ não entrou | — | NDCG subiu, mas HitRate caiu na validação |
| M3b EASE só para bases com ≥ 20 títulos¹ | ✅ aceita | 0,3054 → **0,3721** | melhora e passa A6 |

¹ Criada depois de ver o teste da M3; por isso o número no teste é otimista.

**Final × linha de base original (B0′):** HitRate@10 75,1% → **80,3%** · NDCG@10 0,2964 → **0,3721** (+25,5%) ·
posição de popularidade top 1,0% → top 1,9% · cobertura 9,0% → **16,5%** · cold start com 40 títulos 56,1% → 62,7%.

## 2. Com os dados da usuária (sistema híbrido completo, sem IA, 5 partes)

Positivos de teste: 7 notas e 105 títulos do histórico (103 deles são **séries**). Filmes na base do MovieLens: 87–90,
todos "vistos 1 vez" (nenhum tem nota).

| Variação da escala do MovieLens | NDCG notas | NDCG histórico | AUC histórico | A4 (finais com MovieLens) | A8 (séries nas finais) |
|---|---:|---:|---:|---:|---:|
| Sem MovieLens (= antigo) | 0,126 | 0,343 | 0,654 | 0% | 95% |
| Forte (relativa, até +3) | 0,077 | 0,198 | 0,654 | **30%** ✅ | **70%** ✅ |
| **× força, centrado (padrão)** | **0,126** | 0,329 | 0,652 | 10% ❌ | 90% ❌ |

**Conclusão honesta:** com os dados atuais, nenhuma escala cumpre A4, A7 e A8 ao mesmo tempo.
- Os positivos de teste são quase todos séries, então todo filme que o MovieLens sobe "toma o lugar" de uma série
  que a usuária viu e conta como erro: a medição não consegue premiar um bom filme recomendado.
- Os 87 filmes só têm o sinal "vi uma vez" (+0,4): o sistema não sabe de quais ela gostou.
- O padrão escolhido ("× força, centrado") é o que menos perde (notas: igual; histórico: −4%, um título em uma das
  5 partes). Para A4/A8, use `MOVIELENS_ESCALA=nenhuma` no `server/.env` (perde 42% de NDCG nos dados atuais).
- Para resolver de verdade: dar nota a ≥ 60 dos filmes da base (Meu gosto → "Sua base no MovieLens") e rodar
  `npm run avaliar:usuario -- --usuario=<início do id>` de novo.

## 3. Critérios

| # | Resultado |
|---|---|
| A1 | ✅ 100% (90 de 90 filmes da base usados; antes 0 de 87) |
| A2 | ✅ 90 ≥ 20 (testes cobrem o aviso e o α para bases menores) |
| A3 | ✅ erro máximo 0,005 entre a soma dos componentes e a pontuação |
| A4 | ❌ 10% das finais com MovieLens no padrão (✅ 30% na escala forte); 100% dos filmes ligados à base têm sinal |
| A5 | ✅ todas as melhorias aceitas cumprem; M2 e M3 revertidas |
| A6 | ✅ configuração final: 20 títulos 52,5% ≥ 51,9%; ≥ 5 títulos sempre acima dos "mais populares" |
| A7 | ❌ histórico −4% (padrão); notas igual; AUC 0,652 ≥ 0,60, mas 0,002 abaixo do antigo |
| A8 | ❌ 90% de séries no padrão (✅ 70% na escala forte); ✅ 100% verificado na Netflix BR |
| A9 | ✅ 55 testes passam, build ok. Tempo: a linha de base não foi cronometrada; a geração nova levou 119 s com IA (incluindo 2 erros 503 do Gemini e 40 verificações a mais na Netflix) |
| A10 | ✅ M2 e M3 revertidas e relatadas |

Testes automáticos que protegem o resultado (`tests/movielens-base.test.js`): falham se o MovieLens tiver
contribuição zero, se algum filme disponível ficar fora da base, se a fórmula do peso mudar, se o aviso de < 20 sumir
ou se o rastreamento não somar a pontuação. Provado por mutação: com o MovieLens desligado, 2 testes falham.

## 4. Componente de séries (conteúdo do TMDB + Trakt), 29/10/2026

Avaliação com os dados da usuária (`npm run avaliar:series`), 5 partes, sem IA. Base: 147 séries (111 a favor,
36 contra), todas usadas. Teste: 102 séries que ela gostou e 36 que largou ou avaliou mal, escondidas 1/5 por vez,
entre 100 séries da Netflix BR nunca vistas (≥ 200 votos). Catálogo avaliado: 3.498 séries. Trakt: 144 de 147
séries com lista de relacionadas.

| Versão | HitRate@10 | NDCG@10 | AUC (gostou × não gostou) |
|---|---:|---:|---:|
| (1) Sistema atual | 80,0% | 0,162 | 0,444 |
| (2) + conteúdo | 80,0% | 0,193 | 0,405 |
| (3) + Trakt | 80,0% | 0,223 | 0,497 |
| **(4) + conteúdo + Trakt (no app)** | **80,0%** | **0,239** | **0,468** |
| (4) com p = 1 | 80,0% | 0,248 | 0,472 |
| (4) com p = 3 | 80,0% | 0,254 | 0,472 |
| Só o conteúdo (diagnóstico) | 80,0% | 0,180 | 0,387 |
| Só o Trakt (diagnóstico) | 80,0% | 0,249 | 0,549 |

Critério fixado antes de rodar (NDCG sobe, HitRate não cai, AUC cai no máximo 0,02): **aprovado**.
Ressalvas: o NDCG subiu em 2 das 5 partes (caiu levemente em 2; a 5ª ficou em 0 para todas as versões), então o
ganho médio depende de poucas partes; o AUC fica abaixo de 0,5 em todas as versões com conteúdo (as séries que ela
largou se parecem com as que ela gosta); o Trakt sozinho teve o melhor AUC. p = 2 foi mantido (definido antes);
p = 3 foi um pouco melhor, mas escolher depois de ver o resultado seria ajustar ao teste.
Filmes: pontuação e posição idênticas com e sem o componente (40 filmes conferidos). Nas 20 finais, um mínimo de
30% de filmes e de séries (critério A8) evita que as ~3.500 séries candidatas tirem os filmes da lista.
