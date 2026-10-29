// Manutenção do histórico da Netflix salvo no banco.

import { semNome } from '../../src/modules/cinematch/lib/nomesHistorico.js';

/**
 * Remove do banco o que não faz parte do histórico oficial:
 *   - linhas sem nome (sempre);
 *   - se `manter` vier preenchido, as linhas que não estão no histórico que acabou de ser importado
 *     (o CSV da Netflix sempre traz o histórico completo, então o novo substitui o antigo).
 * Títulos marcados como "Já vi" SÓ por causa dessas linhas também saem. Notas e avaliações
 * feitas no app nunca são apagadas.
 * `db` é o cliente do próprio usuário: o RLS garante que só os dados dele são tocados.
 */
export async function limparHistorico(db, { manter } = {}) {
  const { data: linhas, error } = await db.from('watch_history_import').select('titulo_original, tmdb_id, tipo');
  if (error) throw error;

  const ficar = manter ? new Set(manter) : null;
  const sair = (linhas || []).filter((l) => semNome(l.titulo_original) || (ficar && !ficar.has(l.titulo_original)));
  if (!sair.length) return { historico: 0, titulos: 0 };

  const nomes = sair.map((l) => l.titulo_original);
  for (let i = 0; i < nomes.length; i += 100) {
    const { error: e } = await db.from('watch_history_import').delete().in('titulo_original', nomes.slice(i, i + 100));
    if (e) throw e;
  }

  // "Já vi" vindos só dessas linhas (sem nota, sem avaliação, e que nenhuma linha que fica usa)
  const usados = new Set((linhas || []).filter((l) => !sair.includes(l) && l.tmdb_id).map((l) => `${l.tipo}:${l.tmdb_id}`));
  const orfaos = new Map();
  for (const l of sair) {
    if (!l.tmdb_id || !l.tipo || usados.has(`${l.tipo}:${l.tmdb_id}`)) continue;
    if (!orfaos.has(l.tipo)) orfaos.set(l.tipo, new Set());
    orfaos.get(l.tipo).add(l.tmdb_id);
  }
  let titulos = 0;
  for (const [tipo, ids] of orfaos) {
    const lista = [...ids];
    for (let i = 0; i < lista.length; i += 100) {
      const { data, error: e } = await db
        .from('user_titles')
        .delete()
        .eq('tipo', tipo)
        .eq('origem', 'historico')
        .eq('status', 'ja_vi')
        .is('nota', null)
        .in('tmdb_id', lista.slice(i, i + 100))
        .select('tmdb_id');
      if (e) throw e;
      titulos += data?.length || 0;
    }
  }
  return { historico: sair.length, titulos };
}
