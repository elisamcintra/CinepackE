// AVALIAÇÃO COM OS DADOS DA PESSOA (protocolo c.2, aprovado na Fase 1). Somente leitura: nada é gravado no banco.
//
// Validação cruzada em 5 partes, com semente fixa:
//   1. Os títulos da pessoa com opinião clara são divididos em 5 partes.
//      Positivos: nota 4–5 (explícito) ou histórico com peso >= 0,7 (implícito).
//      Negativos: nota 1–2, "Não me interessa" ou série largada no começo (peso < 0).
//   2. Para cada parte: o perfil é refeito SEM ela (sem IA, para ser determinístico) e o sistema híbrido
//      completo pontua uma lista com os títulos escondidos + 100 títulos da Netflix BR que ela nunca viu.
//   3. Métricas: HitRate@10 e NDCG@10 dos positivos escondidos, AUC "positivo × negativo" e % de séries no top 10.
// Compara dois sistemas na MESMA lista: "sem MovieLens" (igual ao antigo para quem não tinha filmes entre os
// 12 favoritos) e "novo" (base inteira do MovieLens).
//
// Uso: node --env-file=server/.env scripts/avaliacao/usuario.js --email=voce@exemplo.com
// Resultado: dados/avaliacao/usuario-<id>.json e .md (fora do Git: contém os seus títulos)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.AI_PROVIDER = 'none'; // determinístico: a IA fica fora da avaliação (ver o README)
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));

const { supabaseAdmin } = await import('../../server/lib/supabase.js');
const { construirPerfilDeDados } = await import('../../server/services/profileService.js');
const { ranquear } = await import('../../server/services/recommendationService.js');
const { montarBase } = await import('../../server/services/movielensBase.js');
const { getTitle } = await import('../../server/services/tmdbService.js');
const { descobrirVerificados } = await import('../../server/services/netflixCheck.js');
const { semNome } = await import('../../src/modules/cinematch/lib/nomesHistorico.js');
const { mapLimit } = await import('../../server/lib/limit.js');

if (!supabaseAdmin) throw new Error('Supabase não configurado (server/.env).');

// ---------- Quem é a pessoa ----------
async function acharUsuario() {
  if (args.usuario) {
    // Aceita o ID inteiro ou só o começo (ex.: --usuario=d455b835)
    const { data } = await supabaseAdmin.from('taste_profiles').select('user_id');
    const achados = (data || []).filter((p) => p.user_id.startsWith(args.usuario));
    if (achados.length === 1) return achados[0].user_id;
    throw new Error(`--usuario=${args.usuario}: ${achados.length} perfis encontrados (precisa ser 1).`);
  }
  if (!args.email) throw new Error('Informe --email=... (ou --usuario=<id>).');
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === args.email.toLowerCase());
    if (u) return u.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`Usuário ${args.email} não encontrado.`);
}
const uid = await acharUsuario();
const ler = async (tabela, colunas) => {
  const { data, error } = await supabaseAdmin.from(tabela).select(colunas).eq('user_id', uid).limit(5000);
  if (error) throw error;
  return data || [];
};
const dados = {
  quiz: await ler('quiz_answers', 'question_id, option_ids, comentario'),
  historico: (await ler('watch_history_import', 'titulo_original, titulo_tmdb, tmdb_id, tipo, episodios_vistos, vezes, ultima_data, peso, generos, idioma_original, ano, poster_path')).filter(
    (h) => !semNome(h.titulo_original)
  ),
  titulos: await ler('user_titles', 'tmdb_id, tipo, status, nota, motivo, origem, dados, atualizado_em'),
};

// ---------- Itens de teste ----------
const chave = (tipo, id) => `${tipo}:${id}`;
function itensDeTeste() {
  const explicito = new Map();
  for (const t of dados.titulos) {
    if (t.status === 'ja_vi' && t.nota >= 4) explicito.set(chave(t.tipo, t.tmdb_id), { tipo: t.tipo, id: t.tmdb_id, rotulo: 1, fonte: `nota ${t.nota}` });
    else if (t.status === 'ja_vi' && t.nota && t.nota <= 2) explicito.set(chave(t.tipo, t.tmdb_id), { tipo: t.tipo, id: t.tmdb_id, rotulo: 0, fonte: `nota ${t.nota}` });
    else if (t.status === 'nao_interessa') explicito.set(chave(t.tipo, t.tmdb_id), { tipo: t.tipo, id: t.tmdb_id, rotulo: 0, fonte: 'não me interessa' });
  }
  const implicito = new Map();
  for (const h of dados.historico) {
    if (!h.tmdb_id || !h.tipo) continue;
    const k = chave(h.tipo, h.tmdb_id);
    if (explicito.has(k)) continue;
    if (h.peso >= 0.7) implicito.set(k, { tipo: h.tipo, id: h.tmdb_id, rotulo: 1, fonte: 'histórico (peso ≥ 0,7)' });
    else if (h.peso < 0) implicito.set(k, { tipo: h.tipo, id: h.tmdb_id, rotulo: 0, fonte: 'histórico (largou)' });
  }
  return { explicito: [...explicito.values()], implicito: [...implicito.values()] };
}

// Sorteio determinístico
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

// ---------- 100 títulos da Netflix BR que a pessoa nunca viu (lista fixa, guardada) ----------
const dirSaida = path.join(RAIZ, 'dados', 'avaliacao');
mkdirSync(dirSaida, { recursive: true });
const arquivoNaoVistos = path.join(dirSaida, `nao-vistos-${uid.slice(0, 8)}.json`);
async function naoVistos() {
  if (existsSync(arquivoNaoVistos)) return JSON.parse(readFileSync(arquivoNaoVistos, 'utf8'));
  const conhecidos = new Set([...dados.titulos.map((t) => chave(t.tipo, t.tmdb_id)), ...dados.historico.filter((h) => h.tmdb_id).map((h) => chave(h.tipo, h.tmdb_id))]);
  const lotes = await Promise.all(
    ['movie', 'tv'].flatMap((tipo) => [
      descobrirVerificados({ tipo, votosMin: 200 }, { alvo: 60, maxPaginas: 6, excluir: conhecidos }),
      descobrirVerificados({ tipo, votosMin: 200, ordenar: 'nota' }, { alvo: 60, maxPaginas: 6, excluir: conhecidos }),
    ])
  );
  const unicos = new Map();
  for (const t of lotes.flat()) if (!conhecidos.has(chave(t.tipo, t.tmdb_id))) unicos.set(chave(t.tipo, t.tmdb_id), { tipo: t.tipo, id: t.tmdb_id });
  const lista = embaralhar([...unicos.values()], sorteador(7)).slice(0, 100);
  writeFileSync(arquivoNaoVistos, JSON.stringify(lista));
  return lista;
}

// ---------- Métricas ----------
const log2 = (x) => Math.log(x) / Math.LN2;
function metricas(ordenados, escondidos) {
  const pos = new Set(escondidos.filter((x) => x.rotulo === 1).map((x) => chave(x.tipo, x.id)));
  const neg = new Set(escondidos.filter((x) => x.rotulo === 0).map((x) => chave(x.tipo, x.id)));
  const top = ordenados.slice(0, 10);
  let acertos = 0;
  let dcg = 0;
  top.forEach((t, i) => {
    if (pos.has(chave(t.tipo, t.tmdb_id))) {
      acertos++;
      dcg += 1 / log2(i + 2);
    }
  });
  let idcg = 0;
  for (let i = 0; i < Math.min(pos.size, 10); i++) idcg += 1 / log2(i + 2);
  // AUC: chance de um positivo escondido ficar acima de um negativo escondido (pela posição na lista)
  const posicao = new Map(ordenados.map((t, i) => [chave(t.tipo, t.tmdb_id), i]));
  let pares = 0;
  let ganhos = 0;
  for (const p of pos) for (const n of neg) {
    if (!posicao.has(p) || !posicao.has(n)) continue;
    pares++;
    ganhos += posicao.get(p) < posicao.get(n) ? 1 : 0;
  }
  return {
    positivos: pos.size,
    negativos: neg.size,
    hit: pos.size ? (acertos > 0 ? 1 : 0) : null,
    ndcg: pos.size ? dcg / idcg : null,
    auc: pares ? ganhos / pares : null,
    series_top10: top.filter((t) => t.tipo === 'tv').length / Math.max(1, top.length),
    movielens_top10: top.filter((t) => (t.rastreamento?.componentes?.movielens || 0) > 0).length / Math.max(1, top.length),
  };
}

const media = (lista, campo) => {
  const v = lista.map((x) => x[campo]).filter((x) => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

// ---------- Variantes comparadas (null = sem MovieLens, igual ao antigo para esta pessoa) ----------
const VARIANTES = {
  sem_movielens: null,
  novo: { forca: false, centrar: false },
  novo_forca: { forca: true, centrar: false },
  novo_centrado: { forca: false, centrar: true },
  novo_forca_centrado: { forca: true, centrar: true },
};
const NOMES_VARIANTES = {
  sem_movielens: 'Sem MovieLens (antigo)',
  novo: 'Novo: escala relativa (até +3)',
  novo_forca: 'Novo × força da base',
  novo_centrado: 'Novo centrado nos filmes',
  novo_forca_centrado: 'Novo × força, centrado',
};

// ---------- Validação cruzada ----------
async function avaliarConjunto(nome, itens, listaNaoVistos) {
  const s = sorteador(42);
  const positivos = embaralhar(itens.filter((x) => x.rotulo === 1), s);
  const negativos = embaralhar(itens.filter((x) => x.rotulo === 0), s);
  const partes = Array.from({ length: 5 }, () => []);
  positivos.forEach((x, i) => partes[i % 5].push(x));
  negativos.forEach((x, i) => partes[i % 5].push(x));

  const resultado = {};
  for (let p = 0; p < 5; p++) {
    const escondidos = partes[p];
    if (!escondidos.some((x) => x.rotulo === 1)) continue;
    const fora = new Set(escondidos.map((x) => chave(x.tipo, x.id)));
    const dadosTreino = {
      quiz: dados.quiz,
      historico: dados.historico.filter((h) => !fora.has(chave(h.tipo, h.tmdb_id))),
      titulos: dados.titulos.filter((t) => !fora.has(chave(t.tipo, t.tmdb_id))),
    };
    const perfil = await construirPerfilDeDados(dadosTreino, { usarIA: false });
    const refs = [...escondidos, ...listaNaoVistos];
    const titulos = (await mapLimit(refs, 6, (r) => getTitle(r.tipo, r.id).catch(() => null))).filter(Boolean);
    const comBase = { ...perfil, base_movielens: montarBase(dadosTreino) };
    for (const [variante, opcoes] of Object.entries(VARIANTES)) {
      const lista = await ranquear(titulos, opcoes === null ? { ...perfil, base_movielens: null } : comBase, { quantidadeIA: 0, escalaMovielens: opcoes || undefined });
      (resultado[variante] ||= []).push(metricas(lista, escondidos));
    }
    console.log(`   ${nome} parte ${p + 1}: ${escondidos.length} escondidos · NDCG ${Object.keys(VARIANTES).map((v) => `${v} ${resultado[v].at(-1).ndcg?.toFixed(3)}`).join(' · ')}`);
  }
  const resumo = (l) => ({
    partes: l.length,
    positivos: l.reduce((a, x) => a + x.positivos, 0),
    negativos: l.reduce((a, x) => a + x.negativos, 0),
    hit_rate_10: media(l, 'hit'),
    ndcg_10: media(l, 'ndcg'),
    auc: media(l, 'auc'),
    series_top10: media(l, 'series_top10'),
    movielens_top10: media(l, 'movielens_top10'),
  });
  return Object.fromEntries(Object.entries(resultado).map(([v, l]) => [v, resumo(l)]));
}

const inicio = Date.now();
const { explicito, implicito } = itensDeTeste();
const lista = await naoVistos();
console.log(`Itens de teste: explícitos ${explicito.length} (positivos ${explicito.filter((x) => x.rotulo).length}), implícitos ${implicito.length} (positivos ${implicito.filter((x) => x.rotulo).length}); não vistos: ${lista.length}`);
const saida = {
  gerado_em: new Date().toISOString(),
  usuario: uid.slice(0, 8),
  observacao: 'Sem IA (determinístico). "sem_movielens" equivale ao sistema antigo quando nenhum filme estava entre os 12 favoritos.',
  explicito: explicito.filter((x) => x.rotulo === 1).length >= 5 ? await avaliarConjunto('notas', explicito, lista) : { insuficiente: true, positivos: explicito.filter((x) => x.rotulo === 1).length },
  implicito: await avaliarConjunto('histórico', implicito, lista),
};
const nomeArq = path.join(dirSaida, `usuario-${uid.slice(0, 8)}`);
writeFileSync(`${nomeArq}.json`, JSON.stringify(saida, null, 2));

const pc = (x) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(1).replace('.', ',')}%`);
const nd = (x) => (x === null || x === undefined ? '—' : x.toFixed(3).replace('.', ','));
const md = ['# Avaliação com os seus dados (sistema híbrido completo, sem IA)', '', `Gerado em ${new Date().toLocaleString('pt-BR')}.`, ''];
for (const [nome, r] of [['Notas no app (explícito)', saida.explicito], ['Histórico (implícito)', saida.implicito]]) {
  md.push(`## ${nome}`, '');
  if (r.insuficiente) {
    md.push(`Insuficiente: ${r.positivos} notas positivas (mínimo recomendado: 60 notas em filmes que existem no MovieLens).`, '');
    continue;
  }
  md.push(`${r.novo.positivos} positivos e ${r.novo.negativos} negativos escondidos em ${r.novo.partes} partes; cada lista tem também ${lista.length} títulos não vistos.`, '');
  md.push('| Sistema | HitRate@10 | NDCG@10 | AUC (positivo × negativo) | Séries no top 10 | MovieLens no top 10 |', '|---|---:|---:|---:|---:|---:|');
  for (const [n, x] of Object.entries(r).map(([v, x]) => [NOMES_VARIANTES[v] || v, x])) md.push(`| ${n} | ${pc(x.hit_rate_10)} | ${nd(x.ndcg_10)} | ${nd(x.auc)} | ${pc(x.series_top10)} | ${pc(x.movielens_top10)} |`);
  md.push('');
}
writeFileSync(`${nomeArq}.md`, md.join('\n') + '\n');
console.log(`\n✅ Pronto em ${((Date.now() - inicio) / 1000).toFixed(0)}s: ${path.relative(RAIZ, nomeArq)}.md`);
console.log(JSON.stringify({ explicito: saida.explicito, implicito: saida.implicito }, null, 2));
process.exit(0);
