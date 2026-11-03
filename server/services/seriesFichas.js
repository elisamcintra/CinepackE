// "Fichas" de conteúdo das séries (sinopse em inglês, temas, gêneros, criadores, elenco, origem), usadas pelo
// componente de séries (seriesService.js). Uma ficha por série do TMDB, guardada por 30 dias.
//
// Por que um armazenamento próprio (e não o cache comum, um item por série)? O componente avalia o catálogo
// INTEIRO da Netflix BR (~3.500 séries) a cada geração. Ler 3.500 linhas uma a uma seria lento; aqui as fichas
// ficam em 32 "baldes" na tabela api_cache e são carregadas de uma vez quando o servidor sobe.

import { supabaseAdmin } from '../lib/supabase.js';
import { mapLimit } from '../lib/limit.js';
import { DIA } from './cache.js';
import { fichaSerieTmdb } from './tmdbService.js';

const VERSAO = 'v1';
const BALDES = 32;
const PRAZO = 30 * DIA;
const PREFIXO = `series:fichas:${VERSAO}:`;

const memoria = new Map(); // tmdb_id -> ficha
const emAndamento = new Map(); // tmdb_id -> Promise (evita buscar a mesma série duas vezes ao mesmo tempo)
let carregando = null;

// Elenco "fixo": quem aparece em pelo menos 1/3 dos episódios do ator mais presente
// (o aggregate_credits traz centenas de participações especiais, que não dizem nada sobre a série)
const FRACAO_ELENCO_FIXO = 1 / 3;

export function normalizarFicha(d, id) {
  if (!d) return { id: Number(id), ausente: true, em: new Date().toISOString() };
  const elenco = d.aggregate_credits?.cast || [];
  const maxEps = Math.max(0, ...elenco.map((c) => c.total_episode_count || 0));
  const fixos = elenco.filter((c) => (c.total_episode_count || 0) >= maxEps * FRACAO_ELENCO_FIXO);
  return {
    id: d.id,
    em: new Date().toISOString(),
    nome_en: d.name || d.original_name || '',
    sinopse_en: d.overview || '',
    temas: (d.keywords?.results || d.keywords?.keywords || []).map((k) => [k.id, k.name]),
    generos: (d.genres || []).map((g) => g.id),
    criadores: (d.created_by || []).map((c) => [c.id, c.name]),
    elenco: fixos.map((c) => [c.id, c.name]),
    paises: d.origin_country || [],
    idioma: d.original_language || null,
    redes: (d.networks || []).map((n) => n.id),
    temporadas: d.number_of_seasons ?? null,
    episodios: d.number_of_episodes ?? null,
    duracao: d.episode_run_time?.[0] || null,
    formato: d.type || null,
    estreia: d.first_air_date || null,
  };
}

async function carregarDoBanco() {
  if (!supabaseAdmin) return;
  const { data, error } = await supabaseAdmin.from('api_cache').select('valor').like('chave', `${PREFIXO}%`);
  if (error) {
    console.warn('[series-fichas] não consegui ler as fichas guardadas:', error.message);
    return;
  }
  for (const linha of data || []) for (const f of Object.values(linha.valor || {})) if (f?.id && !memoria.has(f.id)) memoria.set(f.id, f);
}

async function gravarBaldes(baldes) {
  if (!supabaseAdmin || !baldes.size) return;
  const linhas = [...baldes].map((b) => {
    const valor = {};
    for (const [id, f] of memoria) if (id % BALDES === b) valor[id] = f;
    return { chave: `${PREFIXO}${b}`, valor, expira_em: new Date(Date.now() + 400 * DIA).toISOString() };
  });
  const { error } = await supabaseAdmin.from('api_cache').upsert(linhas);
  if (error) console.warn('[series-fichas] não consegui guardar as fichas:', error.message);
}

const vencida = (f) => !f?.em || Date.now() - new Date(f.em).getTime() > PRAZO;

/**
 * Fichas das séries pedidas (busca no TMDB só as que faltam ou passaram de 30 dias).
 * Devolve Map(tmdb_id -> ficha). Séries que o TMDB não tem voltam com { ausente: true }.
 */
export async function fichasDasSeries(ids) {
  carregando ||= carregarDoBanco();
  await carregando;
  const unicos = [...new Set(ids.map(Number).filter(Boolean))];
  const faltam = unicos.filter((id) => vencida(memoria.get(id)) && !emAndamento.has(id));
  if (faltam.length) {
    const baldes = new Set();
    const lote = mapLimit(faltam, 8, async (id) => {
      const f = normalizarFicha(await fichaSerieTmdb(id), id);
      memoria.set(id, f);
      baldes.add(id % BALDES);
      return f;
    });
    for (const id of faltam) emAndamento.set(id, lote);
    try {
      await lote;
    } finally {
      for (const id of faltam) emAndamento.delete(id);
    }
    await gravarBaldes(baldes);
  }
  await Promise.all(unicos.map((id) => emAndamento.get(id)).filter(Boolean));
  return new Map(unicos.map((id) => [id, memoria.get(id) || { id, ausente: true }]));
}

// Para os testes: esquece tudo o que estava na memória
export function limparFichas() {
  memoria.clear();
  emAndamento.clear();
  carregando = null;
}
