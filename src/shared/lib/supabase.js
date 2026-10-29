import { createClient } from '@supabase/supabase-js';

// Cliente Supabase do navegador. Usa só a chave PÚBLICA (anon);
// a proteção dos dados vem do Row Level Security no banco.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigurado = !!(url && anonKey);
export const supabase = supabaseConfigurado ? createClient(url, anonKey) : null;
