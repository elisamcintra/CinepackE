import { supabaseAdmin, supabaseConfigurado, supabaseDoUsuario } from './supabase.js';

// Middleware: exige login. Valida o token do Supabase enviado pelo navegador
// e deixa disponível:
//   req.user -> dados do usuário logado
//   req.db   -> cliente Supabase com as permissões DESSE usuário (RLS)
export async function requireAuth(req, res, next) {
  if (!supabaseConfigurado) {
    return res.status(503).json({ erro: 'Supabase não configurado no servidor (veja server/.env).' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ erro: 'Faça login para continuar.' });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ erro: 'Sua sessão expirou. Entre novamente.' });
  }

  req.user = data.user;
  req.db = supabaseDoUsuario(token);
  next();
}
