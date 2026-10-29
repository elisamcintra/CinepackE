// ETAPA 5 DO KDD: INTERPRETAÇÃO / AVALIAÇÃO
// 1. AVALIAÇÃO OFFLINE: usa as pessoas do conjunto de teste (que a mineração nunca viu).
//    Para cada uma, escondemos 20% dos filmes que ela gostou e pedimos 10 recomendações a partir do resto.
//      HitRate@10   = % de pessoas em que pelo menos 1 escondido apareceu entre os 10
//      Precision@10 = dos 10 recomendados, quantos % ela realmente gostou
//      Recall@10    = dos escondidos, quantos % foram encontrados
//    Comparamos com um "baseline" simples: recomendar os filmes mais populares.
// 2. Gera o arquivo usado pelo app (server/data/movielens.json.gz).
// 3. Gera um relatório legível (docs/mineracao/relatorio.md) para estudar e apresentar.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { avaliar as avaliarConjunto, carregarConjunto } from './avaliacao.js';
import { formatar, lerJson, pct } from './util.js';

export const CITACAO =
  'F. Maxwell Harper and Joseph A. Konstan. 2015. The MovieLens Datasets: History and Context. ' +
  'ACM Transactions on Interactive Intelligent Systems (TiiS) 5, 4: 19:1–19:19. https://doi.org/10.1145/2827872';

// Filmes conhecidos para mostrar exemplos no relatório (IDs do TMDB)
const EXEMPLOS = [27205, 603, 680, 129, 13, 157336, 155, 120];

export async function etapa5Interpretacao(cfg) {
  const itens = lerJson(cfg.dirProcessado, 'etapa2-itens.json');
  const min = lerJson(cfg.dirProcessado, 'etapa4-mineracao.json');
  const est = {
    etapa1: lerJson(cfg.dirProcessado, 'etapa1-estatisticas.json'),
    etapa2: lerJson(cfg.dirProcessado, 'etapa2-estatisticas.json'),
    etapa3: lerJson(cfg.dirProcessado, 'etapa3-estatisticas.json'),
    etapa4: lerJson(cfg.dirProcessado, 'etapa4-estatisticas.json'),
  };

  // ---------- 1. Avaliação ----------
  const r = avaliarConjunto(
    carregarConjunto(cfg, 'teste'),
    { vizinhos: min.vizinhos, vizinhosGrandes: min.vizinhosEase, minimoGrandes: cfg.parametros.easeAPartirDe, curtidas: min.curtidas, U: min.U },
    cfg.parametros
  );
  const avaliacao = {
    pessoas_avaliadas: r.modelo.pessoas,
    colaborativo: r.modelo,
    populares: r.populares,
    cold_start: r.cold_start,
    cold_start_populares: r.cold_start_populares,
  };
  const c = avaliacao.colaborativo;
  const b = avaliacao.populares;
  console.log(`   Avaliação com ${avaliacao.pessoas_avaliadas} pessoas de teste:`);
  console.log(`     Filtragem colaborativa: HitRate@10 ${pct(c.hit_rate_10)} · Precision@10 ${pct(c.precision_10)} · NDCG@10 ${c.ndcg_10.toFixed(4)} · cobertura ${pct(c.cobertura)}`);
  console.log(`     Só os mais populares:   HitRate@10 ${pct(b.hit_rate_10)} · Precision@10 ${pct(b.precision_10)} · NDCG@10 ${b.ndcg_10.toFixed(4)}`);

  // ---------- 2. Arquivo usado pelo app ----------
  const filmes = {};
  itens.forEach((f, i) => {
    if (filmes[f.tmdb]) return; // dois filmes do MovieLens apontando para o mesmo TMDB: fica o mais avaliado
    filmes[f.tmdb] = {
      t: f.titulo,
      a: f.ano,
      c: min.cluster[i],
      n: min.curtidas[i],
      v: min.vizinhos[i].map(([j, s, conf, l]) => [itens[j].tmdb, s, conf, l]),
      ...(min.vizinhosEase ? { e: min.vizinhosEase[i].map(([j, s, conf, l]) => [itens[j].tmdb, s, conf, l]) } : {}),
    };
  });
  const saida = {
    versao: 1,
    fonte: { nome: 'MovieLens', base: cfg.nomeBase, descricao: cfg.descricao, url: 'https://grouplens.org/datasets/movielens/', citacao: CITACAO },
    gerado_em: new Date().toISOString(),
    parametros: cfg.parametros,
    estatisticas: {
      notas: est.etapa2.notas_total,
      pessoas: min.U,
      filmes: itens.length,
      regras: est.etapa4.regras_encontradas,
    },
    avaliacao,
    clusters: min.clusters,
    filmes,
  };
  mkdirSync(path.dirname(cfg.saida), { recursive: true });
  const gz = gzipSync(JSON.stringify(saida), { level: 9 });
  writeFileSync(cfg.saida, gz);
  console.log(`   Arquivo do app: ${path.relative(process.cwd(), cfg.saida)} (${(gz.length / 1e6).toFixed(1)} MB)`);

  // ---------- 3. Relatório ----------
  mkdirSync(path.dirname(cfg.relatorio), { recursive: true });
  writeFileSync(cfg.relatorio, montarRelatorio(cfg, itens, min, est, avaliacao));
  console.log(`   Relatório: ${path.relative(process.cwd(), cfg.relatorio)}`);

  return { avaliacao, arquivo: cfg.saida, relatorio: cfg.relatorio };
}

function montarRelatorio(cfg, itens, min, est, avaliacao) {
  const p = cfg.parametros;
  const nome = (i) => `${itens[i].titulo}${itens[i].ano ? ` (${itens[i].ano})` : ''}`;
  const porTmdb = new Map(itens.map((f, i) => [f.tmdb, i]));
  const c = avaliacao.colaborativo;
  const b = avaliacao.populares;
  const vezes = b.precision_10 ? (c.precision_10 / b.precision_10).toFixed(1).replace('.', ',') : '—';
  const linhas = [];
  const l = (s = '') => linhas.push(s);

  l('# Relatório de mineração de dados: MovieLens → CineMatch');
  l();
  l(`Gerado em ${new Date().toLocaleString('pt-BR')} a partir de **${cfg.descricao}**.`);
  l();
  l('Processo seguido: **KDD** (*Knowledge Discovery in Databases*), em 5 etapas. Os scripts estão em `scripts/mineracao/`.');
  l();
  l('## 1. Seleção');
  l(`- Filmes no catálogo do MovieLens: **${formatar(est.etapa1.filmes_no_catalogo)}**`);
  l(`- Com ID do TMDB (que o CineMatch reconhece): **${formatar(est.etapa1.filmes_com_tmdb)}**; descartados sem ID: ${formatar(est.etapa1.filmes_sem_tmdb)}`);
  l();
  l('## 2. Pré-processamento (limpeza)');
  l(`- Notas lidas: **${formatar(est.etapa2.notas_total)}** de **${formatar(est.etapa2.usuarios_total)}** pessoas`);
  l(`- Pessoas mantidas (≥ ${p.minAvaliacoesUsuario} notas): **${formatar(est.etapa2.usuarios_mantidos)}**; removidas: ${formatar(est.etapa2.usuarios_removidos_poucas_notas)}`);
  l(`- Filmes mantidos (≥ ${p.minAvaliacoesFilme} notas): **${formatar(est.etapa2.filmes_mantidos)}**; removidos por poucas notas: ${formatar(est.etapa2.filmes_removidos_poucas_notas)}`);
  l();
  l('## 3. Transformação');
  l(`- Cada pessoa vira uma *transação*: os filmes que ela **gostou** (nota ≥ ${p.notaMinimaGostou} e ≥ a média dela), no máximo ${p.maxGostosPorUsuario}.`);
  l(`- Transações de treino: **${formatar(est.etapa3.transacoes_treino)}**; de teste (separadas para avaliação, ${pct(p.fracaoTeste, 0)}): **${formatar(est.etapa3.transacoes_teste)}**`);
  l(`- Curtidas no total: ${formatar(est.etapa3.curtidas_total)} (média de ${String(est.etapa3.media_curtidas_por_usuario).replace('.', ',')} por pessoa)`);
  l();
  l('## 4. Mineração');
  l(`- Pares de filmes contados: **${formatar(est.etapa4.pares_contados)}**`);
  l(`- **Regras de associação** encontradas (coocorrência ≥ ${p.minCoocorrencia}, confiança ≥ ${pct(p.minConfianca, 0)}, lift ≥ ${String(p.minLift).replace('.', ',')}): **${formatar(est.etapa4.regras_encontradas)}**`);
  l(`- **Similaridade item-item** (filtragem colaborativa): ${p.vizinhosPorFilme} filmes mais parecidos guardados para cada filme`);
  l(`- **Clusterização k-means**: ${est.etapa4.familias} famílias de gosto`);
  l();
  l('### Regras mais fortes (suporte ≥ 1%, confiança ≥ 50%, ordenadas por lift)');
  l();
  l('| Se gostou de… | …também gostou de | Suporte | Confiança | Lift |');
  l('|---|---|---:|---:|---:|');
  for (const r of min.melhoresRegras.slice(0, 20)) {
    l(`| ${nome(r.de)} | ${nome(r.para)} | ${pct(r.suporte)} | ${pct(r.confianca)} | ${r.lift.toFixed(1).replace('.', ',')} |`);
  }
  l();
  l('### Exemplos: filmes mais parecidos (segundo o comportamento das pessoas)');
  l();
  for (const tmdb of EXEMPLOS) {
    const i = porTmdb.get(tmdb);
    if (i === undefined) continue;
    const viz = min.vizinhos[i].slice(0, 5).map(([j, s]) => `${nome(j)} (${s.toFixed(2).replace('.', ',')})`);
    l(`- **${nome(i)}** → ${viz.join(', ')}`);
  }
  l();
  l('### Famílias de gosto (k-means)');
  l();
  l('| # | Família | Filmes | Exemplos |');
  l('|---:|---|---:|---|');
  for (const cl of [...min.clusters].sort((a, b) => b.tamanho - a.tamanho)) {
    l(`| ${cl.id} | ${cl.nome} | ${cl.tamanho} | ${cl.exemplos.map((e) => e.titulo).join(', ')} |`);
  }
  l();
  l('## 5. Interpretação e avaliação');
  l();
  l(`Avaliação offline com **${formatar(avaliacao.pessoas_avaliadas)} pessoas de teste** (que não participaram da mineração).`);
  l(`Para cada uma, escondemos ${pct(p.fracaoEscondida, 0)} dos filmes que ela gostou e pedimos 10 recomendações a partir do resto.`);
  l();
  l(`Modelo: **${p.modelo}**${p.modelo === 'ease' ? ` (λ = ${p.easeLambda})` : ` (α = ${p.alfa})`}${p.gamaConteudo ? `, conteúdo ${p.conteudo.join(' + ')} (γ = ${p.gamaConteudo})` : ''}; pesos da pessoa: ${p.pesoUsuario}${p.meiaVidaUsuarioDias ? `, recência de ${p.meiaVidaUsuarioDias} dias` : ''}.`);
  l();
  l('| Método | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição média de popularidade | Cobertura |');
  l('|---|---:|---:|---:|---:|---:|---:|');
  const linha = (nome, x, neg = '') => l(`| ${nome} | ${neg}${pct(x.hit_rate_10)}${neg} | ${pct(x.precision_10)} | ${pct(x.recall_10)} | ${x.ndcg_10.toFixed(4).replace('.', ',')} | top ${pct(x.posicao_popularidade)} | ${pct(x.cobertura)} |`);
  linha('Filtragem colaborativa (minerada)', c, '**');
  linha('Baseline: só os mais populares', b);
  l();
  if (avaliacao.cold_start) {
    l('### Cold start: acerto conforme o número de títulos que a pessoa já avaliou');
    l();
    l('| Títulos na base | HitRate@10 | NDCG@10 | Posição média de popularidade | Cobertura |');
    l('|---:|---:|---:|---:|---:|');
    for (const [k, x] of Object.entries(avaliacao.cold_start)) l(`| ${k} | ${pct(x.hit_rate_10)} | ${x.ndcg_10.toFixed(4).replace('.', ',')} | top ${pct(x.posicao_popularidade)} | ${pct(x.cobertura)} |`);
    const x = avaliacao.cold_start_populares;
    l(`| mais populares | ${pct(x.hit_rate_10)} | ${x.ndcg_10.toFixed(4).replace('.', ',')} | top ${pct(x.posicao_popularidade)} | ${pct(x.cobertura)} |`);
    l();
  }
  l(`**Conclusão:** as recomendações mineradas acertam **${vezes}x mais** que recomendar só os filmes populares (Precision@10).`);
  l();
  l('## Como o CineMatch usa isso');
  l('- Os vizinhos dos seus filmes favoritos viram **candidatos** a recomendação (sempre verificados na Netflix Brasil).');
  l('- Cada candidato ganha pontos pela **similaridade** com os seus favoritos; o motivo mostra a **confiança** ("62% de quem amou X também amou este").');
  l('- A página **Meu gosto** mostra as regras dos seus favoritos e as suas famílias de gosto.');
  l();
  l('## Glossário');
  l('- **Suporte:** % de todas as pessoas que gostaram dos dois filmes.');
  l('- **Confiança (A ⇒ B):** das pessoas que gostaram de A, quantas % também gostaram de B.');
  l('- **Lift:** quantas vezes a relação é mais forte que o acaso (1 = acaso; 3 = três vezes mais provável).');
  l('- **Similaridade de cosseno:** de 0 a 1, o quanto dois filmes são curtidos pelas mesmas pessoas.');
  l('- **k-means:** algoritmo que separa itens em k grupos de itens parecidos entre si.');
  l('- **HitRate / Precision / Recall @10:** medidas de acerto das 10 primeiras recomendações.');
  l('- **NDCG@10:** como o Precision, mas acertar no 1º lugar vale mais que no 10º (0 a 1).');
  l('- **Posição média de popularidade:** onde os recomendados ficam no ranking dos mais curtidos (top 0,9% = quase só sucessos).');
  l('- **Cobertura:** quantos % dos filmes aparecem em alguma recomendação (baixa = sempre os mesmos).');
  l();
  l('## Fonte e licença');
  l(`Dados: MovieLens (GroupLens Research, Universidade de Minnesota), usados para fins não comerciais. Citação: ${CITACAO}`);
  l('Este projeto não é endossado pela Universidade de Minnesota nem pelo GroupLens.');
  return linhas.join('\n') + '\n';
}
