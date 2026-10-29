// Configuração central do servidor.
// Todas as chaves de API são lidas AQUI, a partir do arquivo server/.env.
// Nenhuma delas é enviada ao navegador.

export const config = {
  port: Number(process.env.PORT) || 3001,
  // Endereço do frontend em produção. Em desenvolvimento, qualquer localhost é aceito.
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  tmdbReadToken: process.env.TMDB_READ_TOKEN || '',
  omdbApiKey: process.env.OMDB_API_KEY || '',
  // Trakt: só o Client ID (endpoints públicos de séries relacionadas). O Client Secret não é usado.
  traktClientId: process.env.TRAKT_CLIENT_ID || '',

  supabaseUrl: process.env.SUPABASE_URL || '',
  // Chave pública: usada para agir "como o usuário" (o RLS do banco continua valendo)
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  // Chave secreta: acesso total. Usada só para os caches compartilhados.
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // IA gratuita: 'gemini' (padrão), 'groq' ou 'none' (só o modo sem IA)
  ai: {
    provider: (process.env.AI_PROVIDER || 'gemini').toLowerCase(),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    // Se o modelo principal estiver sobrecarregado, tenta estes (separados por vírgula)
    geminiReservas: (process.env.GEMINI_MODELOS_RESERVA ?? 'gemini-3.5-flash,gemini-flash-lite-latest')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },
};

export function iaConfigurada() {
  const { provider, geminiApiKey, groqApiKey } = config.ai;
  if (provider === 'gemini') return !!geminiApiKey;
  if (provider === 'groq') return !!groqApiKey;
  return false;
}

// Diz quais chaves estão preenchidas (true/false), sem nunca revelar o valor.
// Usado pela rota /api/health para ajudar a conferir a configuração.
export function configStatus() {
  return {
    tmdb: !!config.tmdbReadToken,
    omdb: !!config.omdbApiKey,
    trakt: !!config.traktClientId,
    supabase: !!config.supabaseUrl && !!config.supabaseServiceRoleKey && !!config.supabaseAnonKey,
    ia: { provedor: config.ai.provider, chaveConfigurada: iaConfigurada() },
  };
}
