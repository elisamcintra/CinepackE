import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };

export const supabaseConfigurado = !!(
  config.supabaseUrl && config.supabaseAnonKey && config.supabaseServiceRoleKey
);

// Cliente "administrador" (service role): ignora o RLS.
// Usado SOMENTE para validar tokens e para as tabelas de cache compartilhadas.
export const supabaseAdmin = supabaseConfigurado
  ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, opcoes)
  : null;

// Cliente que age "como o usuário logado": o banco aplica o RLS,
// então mesmo um bug aqui no servidor não consegue ler dados de outra pessoa.
export function supabaseDoUsuario(token) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    ...opcoes,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
