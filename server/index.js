// Ponto de entrada do backend (Node.js + Express).
// O frontend nunca fala direto com TMDB, OMDb ou a IA: ele chama este servidor,
// que guarda as chaves de API em segredo.

import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config, configStatus } from './lib/config.js';
import tmdbRoutes from './routes/tmdb.js';
import importRoutes from './routes/import.js';
import profileRoutes from './routes/profile.js';
import recommendationRoutes from './routes/recommendations.js';
import searchRoutes from './routes/search.js';
import titleRoutes from './routes/title.js';
import userTitlesRoutes from './routes/userTitles.js';
import * as movielens from './services/movielensService.js';

const app = express();

// CORS: libera o frontend configurado e qualquer porta do localhost
// (o Vite muda de porta sozinho se a 5173 estiver ocupada)
app.use(
  cors({
    origin(origin, cb) {
      const ok = !origin || origin === config.frontendUrl || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      cb(null, ok);
    },
  })
);
// Limite generoso porque o histórico da Netflix pode ter milhares de linhas
app.use(express.json({ limit: '5mb' }));

// Rota de saúde: confirma que o servidor está no ar e quais chaves estão configuradas
app.get('/api/health', (req, res) => {
  res.json({ ok: true, config: { ...configStatus(), movielens: movielens.status() } });
});

app.use('/api/tmdb', tmdbRoutes);
app.use('/api/import', importRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/title', titleRoutes);
app.use('/api/user-titles', userTitlesRoutes);

// Rota não encontrada
app.use('/api', (req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada' });
});

// Em produção (e no futuro app Electron), o próprio servidor entrega o site compilado (pasta dist/)
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const producao = process.env.NODE_ENV === 'production' || process.argv.includes('--producao');
if (producao && existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Tratamento central de erros: loga no terminal e responde em português
app.use((err, req, res, next) => {
  // Erros do banco (Supabase/Postgres) com mensagens mais úteis
  const msg = err?.message || '';
  if (err?.code === '42P01' || err?.code === 'PGRST205' || /could not find the table|relation .* does not exist/i.test(msg)) {
    console.error('[erro] tabela não encontrada:', msg);
    return res.status(500).json({ erro: 'Tabelas do banco não encontradas. Rode o arquivo supabase/schema.sql no Supabase.' });
  }
  if (err?.name === 'TimeoutError') {
    return res.status(504).json({ erro: 'Um serviço externo demorou demais para responder. Tente de novo.' });
  }
  if (!err.publicMessage) console.error('[erro]', err);
  res.status(err.status || 500).json({ erro: err.publicMessage || 'Erro interno no servidor' });
});

const servidor = app.listen(config.port, () => {
  console.log(`CineMatch API rodando em http://localhost:${config.port}`);
  const status = configStatus();
  if (!status.tmdb) console.warn('  ⚠ TMDB_READ_TOKEN não configurado (server/.env)');
  if (!status.supabase) console.warn('  ⚠ Supabase não configurado (server/.env)');
  if (!status.omdb) console.warn('  ⚠ OMDB_API_KEY não configurado: notas do IMDb/RT/Metacritic não aparecerão');
  if (!status.ia.chaveConfigurada) console.warn('  ⚠ IA sem chave: usando recomendações por regras (sem IA)');
  movielens.status(); // carrega a mineração do MovieLens já na subida (ou avisa que falta rodar)
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n❌ A porta ${config.port} já está em uso. Provavelmente o servidor já está rodando em outro terminal.`);
    console.error('   Feche o outro terminal (Ctrl + C) ou mude PORT no server/.env.\n');
    process.exit(1);
  }
  throw e;
});
