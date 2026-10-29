# Protocolo de avaliação do MovieLens (aprovado em 27/10/2026, antes da implementação)

## Regras obrigatórias
1. **Base mínima:** o sinal do MovieLens usa TODOS os filmes do histórico e das notas que existem na base. Sem limite de
   favoritos. Mínimo de 20 títulos; com menos, aviso + peso reduzido por α = N / 20 (com 0, componente desligado).
2. **Peso explícito de cada título:** w = s × r (ver `server/services/movielensBase.js`).
   - s: nota (nota − 3) / 2 · "Não me interessa" −0,6 · visto 1 vez +0,4 · visto 2+ vezes +0,8 (explícito vence implícito)
   - r: 0,5 + 0,5 × 2^(−dias / 730)
3. **Séries:** o MovieLens só tem filmes. Séries não entram na base e recebem 0 ponto do MovieLens.
4. **Nenhuma mudança é considerada pronta sem prova.**

## Avaliação offline (componente MovieLens)
- Conjunto de **teste**: as mesmas 4.007 pessoas da linha de base (hash do ID), 3.000 avaliadas, semente 43, 20% escondidos.
- Conjunto de **validação** (novo, outros 2%): parâmetros escolhidos só nele; o teste é usado uma vez por melhoria.
- Refinamento registrado: a recomendação nunca inclui um filme que a pessoa já avaliou (vale para todos os sistemas
  comparados, inclusive a linha de base B0′).
- Métricas: HitRate, Precision, Recall e NDCG@10, popularidade média, posição no ranking de popularidade, cobertura,
  curva de cold start (1, 3, 5, 10, 20, 40 títulos; semente 44).
- Script: `npm run mineracao:experimentos` → `docs/mineracao/experimentos.md`.

## Avaliação com os dados da pessoa (sistema híbrido completo)
- Validação cruzada em 5 partes (semente 42). Positivos: nota 4–5 ou histórico com peso ≥ 0,7. Negativos: nota 1–2,
  "Não me interessa", série largada. Cada lista: escondidos + 100 títulos da Netflix BR nunca vistos (lista fixa).
- Sem IA (determinístico). Métricas: HitRate@10, NDCG@10, AUC (positivo × negativo), % de séries e de MovieLens no top 10.
- Notas necessárias: ≥ 60 notas em filmes que existem no MovieLens (margem ±13 pontos); ideal: todos os ~87.
- Script: `npm run avaliar:usuario -- --usuario=<início do id>` → `dados/avaliacao/` (fora do Git).

## Critérios de aceite
| # | Critério |
|---|---|
| A1 | 100% dos filmes da pessoa presentes no MovieLens entram na base |
| A2 | Base < 20 → aviso + α; 0 → componente desligado e sinalizado |
| A3 | Cada recomendação tem rastreamento; soma dos componentes = pontuação (erro ≤ 0,01) |
| A4 | MovieLens > 0 em ≥ 90% dos filmes candidatos que ele conhece **e** em ≥ 25% das 20 finais |
| A5 | Offline, no teste: NDCG@10 e HitRate@10 ≥ B0′ em toda melhoria. Exceção (melhoria 2): perda de até 5% no NDCG se a posição média de popularidade for ≥ top 3% e a cobertura ≥ 15% |
| A6 | Cold start: com 20 títulos, HitRate@10 e NDCG@10 ≥ B0′; com ≥ 5 títulos, sempre acima de "mais populares" |
| A7 | Dados da pessoa, sem IA: NDCG@10 e AUC não pioram em relação ao antigo; AUC ≥ 0,60 |
| A8 | Séries nas 20 finais entre 30% e 70%; 100% verificado na Netflix BR; 0 títulos sem nome |
| A9 | Todos os testes passam; build funciona; gerar recomendações ≤ 1,5× o tempo da linha de base |
| A10 | Melhoria que não cumprir A5–A8 é revertida e relatada |

Regra de decisão na validação: uma variação só entra se o NDCG@10 **subir** e o HitRate@10 não cair
(empate não basta: "uma mudança só fica se melhorar").
