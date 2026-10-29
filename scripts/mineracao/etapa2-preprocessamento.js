// ETAPA 2 DO KDD: PRÉ-PROCESSAMENTO (limpeza)
// 1ª passada pelas notas (ratings.csv, dezenas de milhões de linhas, lidas em streaming):
//   - conta quantas notas cada filme recebeu
//   - calcula a média de notas de cada usuário (usada na etapa 3: "gostou" é relativo à pessoa)
// Depois remove o "ruído":
//   - filmes com poucas notas (não dá para tirar conclusão confiável sobre eles)
//   - usuários com poucas notas (dizem pouco sobre gosto)

import path from 'node:path';
import { lerJson, lerLinhas, salvarBinario, salvarJson, VetorCrescente } from './util.js';

// Lê "userId,movieId,rating,timestamp" sem criar arrays (mais rápido em milhões de linhas)
export function lerNota(linha) {
  const c1 = linha.indexOf(',');
  const c2 = linha.indexOf(',', c1 + 1);
  const c3 = linha.indexOf(',', c2 + 1);
  return {
    usuario: Number(linha.slice(0, c1)),
    filme: Number(linha.slice(c1 + 1, c2)),
    nota: Number(linha.slice(c2 + 1, c3 < 0 ? undefined : c3)),
    quando: c3 < 0 ? 0 : Number(linha.slice(c3 + 1)),
  };
}

export async function etapa2Preprocessamento(cfg) {
  const p = cfg.parametros;
  const filmes = lerJson(cfg.dirProcessado, 'etapa1-filmes.json');

  const notasPorFilme = new VetorCrescente(Int32Array);
  const somaPorUsuario = new VetorCrescente(Float64Array);
  const notasPorUsuario = new VetorCrescente(Int32Array);
  let maiorUsuario = 0;

  const total = await lerLinhas(
    path.join(cfg.dirBruto, 'ratings.csv'),
    (linha) => {
      const n = lerNota(linha);
      notasPorFilme.somar(n.filme, 1);
      somaPorUsuario.somar(n.usuario, n.nota);
      notasPorUsuario.somar(n.usuario, 1);
      if (n.usuario > maiorUsuario) maiorUsuario = n.usuario;
    },
    { rotulo: 'Lendo notas (1ª passada)' }
  );

  // Filmes mantidos: têm ID do TMDB e notas suficientes. Ordenados do mais para o menos avaliado.
  const todos = Object.entries(filmes).map(([movieId, f]) => ({ movieId: Number(movieId), ...f, avaliacoes: notasPorFilme.get(Number(movieId)) }));
  const itens = todos.filter((f) => f.avaliacoes >= p.minAvaliacoesFilme).sort((a, b) => b.avaliacoes - a.avaliacoes);

  // Média de cada usuário (NaN = usuário descartado por ter poucas notas)
  const medias = new Float32Array(maiorUsuario + 1).fill(NaN);
  let usuariosTotal = 0;
  let usuariosValidos = 0;
  for (let u = 0; u <= maiorUsuario; u++) {
    const qtd = notasPorUsuario.get(u);
    if (!qtd) continue;
    usuariosTotal++;
    if (qtd >= p.minAvaliacoesUsuario) {
      medias[u] = somaPorUsuario.get(u) / qtd;
      usuariosValidos++;
    }
  }

  let filmesAvaliados = 0;
  for (let m = 0; m < notasPorFilme.dados.length; m++) if (notasPorFilme.dados[m] > 0) filmesAvaliados++;

  const estatisticas = {
    notas_total: total,
    usuarios_total: usuariosTotal,
    usuarios_mantidos: usuariosValidos,
    usuarios_removidos_poucas_notas: usuariosTotal - usuariosValidos,
    filmes_avaliados: filmesAvaliados,
    filmes_com_tmdb_avaliados: todos.filter((f) => f.avaliacoes > 0).length,
    filmes_mantidos: itens.length,
    filmes_removidos_poucas_notas: todos.filter((f) => f.avaliacoes > 0).length - itens.length,
  };
  console.log(`   Mantidos: ${itens.length.toLocaleString('pt-BR')} filmes e ${usuariosValidos.toLocaleString('pt-BR')} usuários`);

  salvarJson(cfg.dirProcessado, 'etapa2-itens.json', itens);
  salvarBinario(cfg.dirProcessado, 'etapa2-medias.bin', medias);
  salvarJson(cfg.dirProcessado, 'etapa2-estatisticas.json', estatisticas);
  return estatisticas;
}
