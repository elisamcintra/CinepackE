// Cache em duas camadas:
//   1. Memória (rápido, mas some quando o servidor reinicia)
//   2. Tabela `api_cache` no Supabase (sobrevive a reinícios; protege o limite diário do OMDb)
// Se o Supabase não estiver configurado, funciona só com a memória.

import { supabaseAdmin } from '../lib/supabase.js';

export const HORA = 60 * 60 * 1000;
export const DIA = 24 * HORA;

const MAX_MEMORIA = 5000;
const memoria = new Map(); // chave -> { valor, expira }
const emAndamento = new Map(); // evita buscar a mesma coisa duas vezes ao mesmo tempo
let avisouErroBanco = false;

function avisarErroBanco(error) {
  if (avisouErroBanco) return;
  avisouErroBanco = true;
  console.warn('[cache] Não consegui usar a tabela api_cache (rodou o supabase/schema.sql?):', error.message);
}

function guardarNaMemoria(chave, valor, expira) {
  if (memoria.size >= MAX_MEMORIA) {
    // Remove o item mais antigo (o Map mantém a ordem de inserção)
    memoria.delete(memoria.keys().next().value);
  }
  memoria.set(chave, { valor, expira });
}

export async function getCache(chave) {
  const m = memoria.get(chave);
  if (m && m.expira > Date.now()) return m.valor;

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('api_cache')
      .select('valor, expira_em')
      .eq('chave', chave)
      .maybeSingle();
    if (error) avisarErroBanco(error);
    else if (data && new Date(data.expira_em).getTime() > Date.now()) {
      guardarNaMemoria(chave, data.valor, new Date(data.expira_em).getTime());
      return data.valor;
    }
  }
  return undefined;
}

export async function setCache(chave, valor, ttlMs, { persistir = true } = {}) {
  const expira = Date.now() + ttlMs;
  guardarNaMemoria(chave, valor, expira);
  if (supabaseAdmin && persistir) {
    // Não esperamos o banco responder: o cache é "melhor esforço"
    supabaseAdmin
      .from('api_cache')
      .upsert({ chave, valor, expira_em: new Date(expira).toISOString() })
      .then(({ error }) => error && avisarErroBanco(error));
  }
}

// Atalho: devolve do cache ou executa `fn`, guarda e devolve.
// Resultados `undefined` não são guardados (ex.: erro temporário).
export async function cached(chave, ttlMs, fn, opcoes) {
  const hit = await getCache(chave);
  if (hit !== undefined) return hit;

  if (emAndamento.has(chave)) return emAndamento.get(chave);
  const promessa = (async () => {
    try {
      const valor = await fn();
      if (valor !== undefined) await setCache(chave, valor, ttlMs, opcoes);
      return valor;
    } finally {
      emAndamento.delete(chave);
    }
  })();
  emAndamento.set(chave, promessa);
  return promessa;
}
