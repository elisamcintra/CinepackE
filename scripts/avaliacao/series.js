// AVALIAÇÃO DO COMPONENTE DE SÉRIES com os dados da pessoa. Somente leitura: nada é gravado nos dados dela.
//
// Validação cruzada em 5 partes (semente fixa):
//   - Itens de teste: séries com opinião clara.
//       Gostou: nota 4–5, ou histórico com peso ≥ 0,7 (sem nota).   Não gostou: nota 1–2, "Não me interessa"
//       ou série largada no começo (peso < 0).
//   - Em cada parte, essas séries são ESCONDIDAS: o perfil, a base de séries e o Trakt usam só o resto.
//   - Lista a ordenar: as séries escondidas + 100 séries da Netflix BR que a pessoa nunca viu (lista fixa, guardada).
//   - Métricas: HitRate@10 e NDCG@10 das que ela gostou; AUC "gostou × não gostou" (das escondidas).
// Versões comparadas na MESMA lista (sem IA, para ser determinístico):
//   (1) sistema atual   (2) + conteúdo   (3) + Trakt   (4) + conteúdo + Trakt (a versão do app)
//   e, para diagnóstico: só o conteúdo, só o Trakt e o expoente p (1, 2, 3).
// Critério de aceite (fixado ANTES de rodar): a versão (4) precisa SUBIR o NDCG@10, não pode baixar o HitRate@10
// e não pode baixar o AUC mais que 0,02. Se não passar, o componente é revertido.
//
// Uso: node --env-file=server/.env scripts/avaliacao/series.js --email=pessoa@exemplo.com
// Saída: dados/avaliacao/series-<id>.json e .md (fora do Git: contém os títulos da pessoa)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.AI_PROVIDER = 'none';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));

const { supabaseAdmin } = await import('../../server/lib/supabase.js');
const { construirPerfilDeDados } = await import('../../server/services/profileService.js');
const { candidatosDasSementes, ranquear } = await import('../../server/services/recommendationService.js');
const { montarBaseSeries, prepararSeries, sinaisDeSeries, ESCALA_SERIES } = await import('../../server/services/seriesService.js');
const { catalogoSeriesNetflix, getTitle } = await import('../../server/services/tmdbService.js');
const { descobrirVerificados, chaveTitulo } = await import('../../server/services/netflixCheck.js');
const { semNome } = await import('../../src/modules/cinematch/lib/nomesHistorico.js');
const { mapLimit } = await import('../../server/lib/limit.js');

// ---------- Pessoa ----------
const usuarios = (await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })).data.users;
const u = usuarios.find((x) => (args.email && x.email?.toLowerCase() === args.email.toLowerCase()) || (args.usuario && x.id.startsWith(args.usuario)));
if (!u) throw new Error('Pessoa não encontrada (--email=... ou --usuario=...).');
const uid = u.id;
const ler = async (tabela, colunas) => {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabaseAdmin.from(tabela).select(colunas).eq('user_id', uid).range(i, i + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};
const dados = {
  quiz: await ler('quiz_answers', 'question_id, option_ids, comentario'),
  historico: (await ler('watch_history_import', 'titulo_original, titulo_tmdb, tmdb_id, tipo, episodios_vistos, vezes, ultima_data, peso, generos, idioma_original, ano, poster_path')).filter((h) => !semNome(h.titulo_original)),
  titulos: await ler('user_titles', 'tmdb_id, tipo, status, nota, motivo, origem, dados, atualizado_em'),
};

// ---------- Itens de teste (só séries) ----------
const baseCompleta = montarBaseSeries(dados);
const itens = [];
for (const x of baseCompleta.itens) {
  const nota = dados.titulos.find((t) => t.tipo === 'tv' && t.tmdb_id === x.tmdb_id)?.nota;
  let rotulo = null;
  if (x.fonte === 'nota') rotulo = nota >= 4 ? 1 : nota <= 2 ? 0 : null;
  else if (x.fonte === 'nao_interessa') rotulo = 0;
  else if (x.fonte === 'historico') rotulo = x.w >= 0.7 ? 1 : x.w < 0 ? 0 : null;
  if (rotulo !== null) itens.push({ id: x.tmdb_id, titulo: x.titulo, rotulo });
}

function sorteador(semente) {
  let t = semente >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const embaralhar = (l, s) => {
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(s() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
};

// ---------- 100 séries da Netflix BR que ela nunca viu (lista fixa) ----------
const dirSaida = path.join(RAIZ, 'dados', 'avaliacao');
mkdirSync(dirSaida, { recursive: true });
const arqNaoVistas = path.join(dirSaida, `nao-vistas-series-${uid.slice(0, 8)}.json`);
const conhecidas = new Set([...baseCompleta.itens.map((x) => x.tmdb_id), ...dados.titulos.filter((t) => t.tipo === 'tv').map((t) => t.tmdb_id)]);
let naoVistas;
if (existsSync(arqNaoVistas)) naoVistas = JSON.parse(readFileSync(arqNaoVistas, 'utf8'));
else {
  // Mesmo critério das avaliações anteriores: séries com pelo menos 200 votos no TMDB (nada de títulos obscuros)
  const cat = await catalogoSeriesNetflix();
  naoVistas = embaralhar(cat.series.filter((s) => s.votos >= 200 && !conhecidas.has(s.id)).map((s) => s.id), sorteador(7)).slice(0, 100);
  writeFileSync(arqNaoVistas, JSON.stringify(naoVistas));
}

// ---------- Métricas ----------
const log2 = (x) => Math.log(x) / Math.LN2;
function metricas(ordenados, escondidos) {
  const pos = new Set(escondidos.filter((x) => x.rotulo === 1).map((x) => x.id));
  const neg = new Set(escondidos.filter((x) => x.rotulo === 0).map((x) => x.id));
  const top = ordenados.slice(0, 10);
  let acertos = 0;
  let dcg = 0;
  top.forEach((id, i) => {
    if (pos.has(id)) {
      acertos++;
      dcg += 1 / log2(i + 2);
    }
  });
  let idcg = 0;
  for (let i = 0; i < Math.min(pos.size, 10); i++) idcg += 1 / log2(i + 2);
  const posicao = new Map(ordenados.map((id, i) => [id, i]));
  let pares = 0;
  let ganhos = 0;
  for (const p of pos) for (const n of neg) {
    if (!posicao.has(p) || !posicao.has(n)) continue;
    pares++;
    ganhos += posicao.get(p) < posicao.get(n) ? 1 : posicao.get(p) === posicao.get(n) ? 0.5 : 0;
  }
  return { hit: pos.size ? (acertos > 0 ? 1 : 0) : null, ndcg: pos.size ? dcg / idcg : null, auc: pares ? ganhos / pares : null, acertos };
}
const media = (l, c) => {
  const v = l.map((x) => x[c]).filter((x) => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

// ---------- Versões ----------
const VERSOES = {
  atual: { nome: '(1) Sistema atual', escala: null },
  conteudo: { nome: '(2) + conteúdo', escala: { ...ESCALA_SERIES, trakt: false } },
  trakt: { nome: '(3) + Trakt', escala: { ...ESCALA_SERIES, conteudo: false } },
  conteudo_trakt: { nome: '(4) + conteúdo + Trakt (versão do app)', escala: { ...ESCALA_SERIES } },
  conteudo_trakt_p1: { nome: '(4) com p = 1 (média simples)', escala: { ...ESCALA_SERIES, p: 1 } },
  conteudo_trakt_p3: { nome: '(4) com p = 3', escala: { ...ESCALA_SERIES, p: 3 } },
};
const SO = { so_conteudo: 'Só o conteúdo (diagnóstico)', so_trakt: 'Só o Trakt (diagnóstico)' };

const inicio = Date.now();
const positivos = embaralhar(itens.filter((x) => x.rotulo === 1), sorteador(42));
const negativos = embaralhar(itens.filter((x) => x.rotulo === 0), sorteador(43));
const partes = Array.from({ length: 5 }, () => []);
positivos.forEach((x, i) => partes[i % 5].push(x));
negativos.forEach((x, i) => partes[i % 5].push(x));
console.log(`Séries na base: ${baseCompleta.total} (${baseCompleta.positivas} a favor, ${baseCompleta.negativas} contra). Teste: ${positivos.length} gostou, ${negativos.length} não gostou; ${naoVistas.length} nunca vistas.`);

const resultados = {};
const porParte = [];
const exemplos = [];
for (let p = 0; p < 5; p++) {
  const escondidos = partes[p];
  const fora = new Set(escondidos.map((x) => x.id));
  const treino = {
    quiz: dados.quiz,
    historico: dados.historico.filter((h) => !(h.tipo === 'tv' && fora.has(h.tmdb_id))),
    titulos: dados.titulos.filter((t) => !(t.tipo === 'tv' && fora.has(t.tmdb_id))),
  };
  const perfil = await construirPerfilDeDados(treino, { usarIA: false });
  // Consenso das sementes, como no app (as escondidas não estão excluídas: precisam poder aparecer)
  const excluir = new Set(treino.titulos.filter((t) => t.status === 'ja_vi' || t.status === 'nao_interessa').map((t) => chaveTitulo(t.tipo, t.tmdb_id)));
  const sinais = new Map();
  await candidatosDasSementes(perfil, excluir, sinais);
  const ids = [...escondidos.map((x) => x.id), ...naoVistas];
  const titulos = (await mapLimit(ids, 8, (id) => getTitle('tv', id).catch(() => null))).filter(Boolean);
  const prep = await prepararSeries(montarBaseSeries(treino), { extras: ids });
  if (prep.base.itens.some((x) => fora.has(x.tmdb_id))) throw new Error('vazamento: série escondida na base de treino');

  const linha = { parte: p + 1, escondidos: escondidos.length };
  for (const [v, cfg] of Object.entries(VERSOES)) {
    const lista = await ranquear(titulos, { ...perfil, base_movielens: null }, { sinais, quantidadeIA: 0, series: cfg.escala ? prep : null, escalaSeries: cfg.escala || undefined });
    const m = metricas(lista.map((t) => t.tmdb_id), escondidos);
    (resultados[v] ||= []).push(m);
    linha[v] = m.ndcg;
    if (v === 'conteudo_trakt' || v === 'atual') exemplos.push({ parte: p + 1, versao: v, top10: lista.slice(0, 10).map((t) => ({ titulo: t.titulo, escondida: fora.has(t.tmdb_id) ? (escondidos.find((x) => x.id === t.tmdb_id).rotulo ? 'gostou' : 'não gostou') : null, componentes: t.rastreamento.componentes })) });
  }
  // Diagnóstico: cada fonte sozinha
  const { sinais: s2 } = await sinaisDeSeries(prep, titulos, ESCALA_SERIES);
  for (const [v, campo] of [['so_conteudo', 'conteudo'], ['so_trakt', 'trakt']]) {
    const ordem = [...titulos].sort((a, b) => (s2.get(b.tmdb_id)?.[campo].S ?? 0) - (s2.get(a.tmdb_id)?.[campo].S ?? 0) || b.popularidade - a.popularidade).map((t) => t.tmdb_id);
    (resultados[v] ||= []).push(metricas(ordem, escondidos));
  }
  porParte.push(linha);
  console.log(`  parte ${p + 1}: ${escondidos.length} escondidas · NDCG atual ${linha.atual?.toFixed(3)} → app ${linha.conteudo_trakt?.toFixed(3)}`);
}

// ---------- Filmes não mudam (o componente só vale para séries) ----------
const filmes = await descobrirVerificados({ tipo: 'movie', votosMin: 200 }, { alvo: 40, maxPaginas: 4 });
const perfilFull = await construirPerfilDeDados(dados, { usarIA: false });
const prepFull = await prepararSeries(baseCompleta);
const semComp = await ranquear(filmes, perfilFull, { quantidadeIA: 0 });
const comComp = await ranquear(filmes, perfilFull, { quantidadeIA: 0, series: prepFull });
const filmesIguais = semComp.length === comComp.length && semComp.every((t, i) => t.tmdb_id === comComp[i].tmdb_id && t.score === comComp[i].score);

const resumo = Object.fromEntries(
  Object.entries(resultados).map(([v, l]) => [v, { partes: l.length, hit_rate_10: media(l, 'hit'), ndcg_10: media(l, 'ndcg'), auc: media(l, 'auc') }])
);
const a = resumo.atual;
const b = resumo.conteudo_trakt;
const criterio = {
  ndcg_sobe: b.ndcg_10 > a.ndcg_10,
  hit_nao_cai: b.hit_rate_10 >= a.hit_rate_10,
  auc_ate_menos_002: b.auc >= a.auc - 0.02,
  partes_em_que_ndcg_subiu: porParte.filter((x) => x.conteudo_trakt > x.atual).length,
};
criterio.aprovado = criterio.ndcg_sobe && criterio.hit_nao_cai && criterio.auc_ate_menos_002;

const saida = {
  gerado_em: new Date().toISOString(),
  pessoa: uid.slice(0, 8),
  base: { series: baseCompleta.total, positivas: baseCompleta.positivas, negativas: baseCompleta.negativas, neutras: baseCompleta.neutras },
  teste: { gostou: positivos.length, nao_gostou: negativos.length, nunca_vistas: naoVistas.length },
  catalogo_netflix_series: prepFull.catalogo.series.length,
  trakt: prepFull.trakt,
  resumo,
  por_parte: porParte,
  criterio,
  filmes_iguais_com_e_sem_componente: filmesIguais,
  filmes_comparados: filmes.length,
  exemplos,
  tempo_s: Math.round((Date.now() - inicio) / 1000),
};
const arq = path.join(dirSaida, `series-${uid.slice(0, 8)}`);
writeFileSync(`${arq}.json`, JSON.stringify(saida, null, 2));

const pc = (x) => (x == null ? '—' : `${(x * 100).toFixed(1).replace('.', ',')}%`);
const nd = (x) => (x == null ? '—' : x.toFixed(3).replace('.', ','));
const md = [
  '# Componente de séries: avaliação com os seus dados (5 partes, sem IA)',
  '',
  `Gerado em ${new Date().toLocaleString('pt-BR')} (${saida.tempo_s}s). Base: ${saida.base.series} séries suas (${saida.base.positivas} a favor, ${saida.base.negativas} contra). ` +
    `Teste: ${saida.teste.gostou} que você gostou e ${saida.teste.nao_gostou} que não gostou, escondidas 1/5 por vez, entre ${saida.teste.nunca_vistas} séries da Netflix BR nunca vistas.`,
  '',
  '| Versão | HitRate@10 | NDCG@10 | AUC (gostou × não gostou) |',
  '|---|---:|---:|---:|',
  ...Object.entries(VERSOES).map(([v, c]) => `| ${c.nome} | ${pc(resumo[v].hit_rate_10)} | ${nd(resumo[v].ndcg_10)} | ${nd(resumo[v].auc)} |`),
  ...Object.entries(SO).map(([v, n]) => `| ${n} | ${pc(resumo[v].hit_rate_10)} | ${nd(resumo[v].ndcg_10)} | ${nd(resumo[v].auc)} |`),
  '',
  '## NDCG@10 por parte',
  '',
  '| Parte | Escondidas | (1) atual | (2) + conteúdo | (3) + Trakt | (4) app |',
  '|---:|---:|---:|---:|---:|---:|',
  ...porParte.map((x) => `| ${x.parte} | ${x.escondidos} | ${nd(x.atual)} | ${nd(x.conteudo)} | ${nd(x.trakt)} | ${nd(x.conteudo_trakt)} |`),
  '',
  `**Critério de aceite (fixado antes):** NDCG sobe ${criterio.ndcg_sobe ? '✅' : '❌'} · HitRate não cai ${criterio.hit_nao_cai ? '✅' : '❌'} · AUC cai no máximo 0,02 ${criterio.auc_ate_menos_002 ? '✅' : '❌'} → **${criterio.aprovado ? 'APROVADO' : 'REPROVADO'}** (NDCG subiu em ${criterio.partes_em_que_ndcg_subiu} de 5 partes).`,
  '',
  `Filmes: com e sem o componente, as ${filmes.length} posições e notas são ${filmesIguais ? 'idênticas ✅' : 'DIFERENTES ❌'}.`,
  '',
  `Catálogo de séries da Netflix BR: ${saida.catalogo_netflix_series}. Trakt: ${saida.trakt.com_lista} de ${saida.trakt.consultadas} séries suas com lista de relacionadas.`,
];
writeFileSync(`${arq}.md`, md.join('\n') + '\n');
console.log(md.join('\n'));
process.exit(0);
