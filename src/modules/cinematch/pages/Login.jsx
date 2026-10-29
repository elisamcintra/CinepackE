import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { traduzirErroAuth, useAuth } from '../../../shared/auth/AuthProvider.jsx';
import { supabase } from '../../../shared/lib/supabase.js';

export default function Login() {
  const { configurado, user } = useAuth();
  const location = useLocation();
  const [modo, setModo] = useState('entrar'); // 'entrar' | 'criar'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

  if (!configurado) return <Navigate to="/cinematch/configuracao" replace />;
  if (user) return <Navigate to={location.state?.de || '/cinematch'} replace />;

  const enviar = async (e) => {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { full_name: nome.trim() || undefined }, emailRedirectTo: `${window.location.origin}/cinematch` },
        });
        if (error) throw error;
        if (!data.session) {
          setAviso('Conta criada! Enviamos um email de confirmação. Clique no link e depois entre aqui.');
          setModo('entrar');
        }
      }
    } catch (e) {
      setErro(traduzirErroAuth(e.message));
    } finally {
      setEnviando(false);
    }
  };

  const google = async () => {
    setErro(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/cinematch` },
    });
    if (error) setErro(traduzirErroAuth(error.message));
  };

  return (
    <div className="grid min-h-[75vh] items-center gap-10 lg:grid-cols-2">
      {/* Apresentação */}
      <div className="hidden lg:block">
        <p className="font-display text-7xl leading-none tracking-wide text-cine-accent">CineMatch</p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight">O que assistir hoje, de verdade.</h1>
        <p className="mt-4 max-w-md text-lg text-cine-muted">
          Recomendações de filmes e séries <strong className="text-cine-text">disponíveis na sua Netflix</strong>, feitas a partir do
          seu gosto real: o que você já assistiu e o que você conta pra gente.
        </p>
        <ul className="mt-8 space-y-3 text-cine-muted">
          <li>🎞️ Só títulos verificados na Netflix Brasil</li>
          <li>🧬 Um perfil de gosto que entende nuances</li>
          <li>💬 O motivo de cada recomendação, e o que o público achou</li>
        </ul>
      </div>

      {/* Formulário */}
      <div className="cartao mx-auto w-full max-w-md p-6 sm:p-8">
        <p className="font-display text-4xl tracking-wide text-cine-accent lg:hidden">CineMatch</p>
        <h2 className="text-xl font-semibold">{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h2>

        <button onClick={google} className="btn-secundario mt-6 w-full">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Entrar com Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-cine-muted">
          <span className="h-px flex-1 bg-cine-border" /> ou com email <span className="h-px flex-1 bg-cine-border" />
        </div>

        <form onSubmit={enviar} className="space-y-4">
          {modo === 'criar' && (
            <label className="block">
              <span className="rotulo">Como podemos te chamar?</span>
              <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="given-name" />
            </label>
          )}
          <label className="block">
            <span className="rotulo">Email</span>
            <input className="campo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="block">
            <span className="rotulo">Senha</span>
            <input
              className="campo"
              type="password"
              required
              minLength={6}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            />
          </label>

          {erro && <p className="rounded-lg bg-cine-danger/10 px-3 py-2 text-sm text-red-300">{erro}</p>}
          {aviso && <p className="rounded-lg bg-cine-ok/10 px-3 py-2 text-sm text-green-300">{aviso}</p>}

          <button type="submit" className="btn-primario w-full" disabled={enviando}>
            {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-cine-muted">
          {modo === 'entrar' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
          <button
            className="font-medium text-cine-accent hover:underline"
            onClick={() => {
              setModo(modo === 'entrar' ? 'criar' : 'entrar');
              setErro(null);
            }}
          >
            {modo === 'entrar' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
        <p className="mt-4 text-center text-xs text-cine-muted">
          Nunca pedimos sua senha da Netflix. ·{' '}
          <Link to="/cinematch/configuracao" className="hover:underline">
            Configuração
          </Link>
        </p>
      </div>
    </div>
  );
}
