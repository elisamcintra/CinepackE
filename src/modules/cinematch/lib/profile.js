// Leitura/gravação direta no Supabase (o RLS garante que cada um só mexe nos próprios dados).
import { supabase } from '../../../shared/lib/supabase.js';

// O usuário já tem perfil de gosto? (decide se vai para o Dashboard ou para a Home de escolha)
export async function temPerfil() {
  const { data, error } = await supabase.from('taste_profiles').select('user_id').maybeSingle();
  if (error) throw error;
  return !!data;
}

// Respostas do quiz no formato { [question_id]: { option_ids, comentario } }
export async function carregarRespostas() {
  const { data, error } = await supabase.from('quiz_answers').select('question_id, option_ids, comentario');
  if (error) throw error;
  const mapa = {};
  for (const r of data || []) mapa[r.question_id] = { option_ids: r.option_ids || [], comentario: r.comentario || '' };
  return mapa;
}

export async function salvarResposta(userId, questionId, { option_ids, comentario }) {
  const { error } = await supabase.from('quiz_answers').upsert({
    user_id: userId,
    question_id: questionId,
    option_ids: option_ids || [],
    comentario: comentario?.trim() ? comentario.trim().slice(0, 2000) : null,
    atualizado_em: new Date().toISOString(),
  });
  if (error) throw error;
}

// Títulos que a pessoa marcou com ❤️ na avaliação rápida (sugestões para a pergunta 10)
export async function titulosAmados() {
  const { data, error } = await supabase
    .from('user_titles')
    .select('tmdb_id, tipo, dados')
    .eq('status', 'ja_vi')
    .eq('nota', 5)
    .order('atualizado_em', { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data || []).map((t) => ({ tmdb_id: t.tmdb_id, tipo: t.tipo, ...t.dados }));
}

export async function ultimoFiltro() {
  const { data } = await supabase.from('profiles').select('ultimo_filtro').maybeSingle();
  return data?.ultimo_filtro || null;
}
