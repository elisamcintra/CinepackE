import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigurado } from '../lib/supabase.js';
import { setAccessTokenGetter } from '../lib/apiClient.js';

// Login compartilhado por todos os módulos do hub.
const AuthContext = createContext(null);

// Toda chamada ao nosso backend leva o token de login atual
setAccessTokenGetter(async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [carregando, setCarregando] = useState(supabaseConfigurado);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nova) => setSession(nova));
    return () => data.subscription.unsubscribe();
  }, []);

  const valor = useMemo(
    () => ({
      configurado: supabaseConfigurado,
      carregando,
      session,
      user: session?.user || null,
      sair: () => supabase?.auth.signOut(),
    }),
    [carregando, session]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

// Traduz as mensagens de erro mais comuns do Supabase Auth
export function traduzirErroAuth(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu email antes de entrar (veja sua caixa de entrada).';
  if (m.includes('user already registered')) return 'Este email já tem conta. Use "Entrar".';
  if (m.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Email inválido.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Espere um pouco e tente de novo.';
  if (m.includes('provider is not enabled')) return 'Login com Google ainda não foi ativado no Supabase (veja o README).';
  return msg || 'Algo deu errado. Tente de novo.';
}
