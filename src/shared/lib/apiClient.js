// Cliente HTTP para conversar com o NOSSO backend (pasta server/).
// O frontend nunca chama TMDB/OMDb/IA direto: tudo passa por aqui.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Na fase 2, esta função vai anexar o token de login do Supabase em cada requisição.
let getAccessToken = async () => null;
export function setAccessTokenGetter(fn) {
  getAccessToken = fn;
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Não foi possível falar com o servidor. Ele está rodando?');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const erro = new Error(data.erro || `Erro ${res.status}`);
    erro.status = res.status; // ex.: 404 = "ainda não tem perfil"
    throw erro;
  }
  return data;
}
