import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';
import { mapLimit } from '../lib/limit.js';
import { TEMAS_BLOQUEAVEIS } from '../lib/temas.js';
import { carregarBase } from '../services/movielensBase.js';
import { carregarPerfil, gerarPerfil } from '../services/profileService.js';
import { keywordIdExato } from '../services/tmdbService.js';

const router = Router();
router.use(requireAuth);

// GET /api/profile -> perfil de gosto atual (ou null)
router.get('/', async (req, res) => {
  res.json({ perfil: await carregarPerfil(req.db) });
});

// POST /api/profile/generate -> gera (IA + fallback) e salva o perfil
router.post('/generate', async (req, res) => {
  const perfil = await gerarPerfil(req.db, req.user.id);
  res.json({ perfil });
});

// GET /api/profile/movielens -> a base do MovieLens: todos os seus filmes que a mineração conhece, com o peso de cada um
router.get('/movielens', async (req, res) => {
  res.json(await carregarBase(req.db));
});

// GET /api/profile/temas -> temas que podem ser bloqueados + os bloqueados agora
router.get('/temas', async (req, res) => {
  const linha = await carregarPerfil(req.db);
  res.json({
    temas: Object.entries(TEMAS_BLOQUEAVEIS).map(([id, t]) => ({ id, nome: t.nome })),
    bloqueados: linha?.perfil?.temas_bloqueados?.ids || [],
  });
});

// PUT /api/profile/temas  { ids: ['video_games', ...] } -> esses temas nunca mais aparecem nas recomendações
router.put('/temas', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter((id) => TEMAS_BLOQUEAVEIS[id]))] : null;
  if (!ids) throw new HttpError(400, 'Lista de temas inválida.');
  const linha = await carregarPerfil(req.db);
  if (!linha) throw new HttpError(404, 'Crie seu perfil antes de bloquear temas.');

  const termos = [...new Set(ids.flatMap((id) => TEMAS_BLOQUEAVEIS[id].termos || []))];
  const kwIds = (await mapLimit(termos, 4, (t) => keywordIdExato(t))).filter(Boolean);
  const temas_bloqueados = {
    ids,
    palavras_chave: kwIds,
    generos: [...new Set(ids.flatMap((id) => TEMAS_BLOQUEAVEIS[id].generos || []))],
  };
  const perfil = { ...linha.perfil, temas_bloqueados };
  const { error } = await req.db.from('taste_profiles').update({ perfil }).eq('user_id', req.user.id);
  if (error) throw error;
  await req.db.from('recommendation_cache').delete().eq('user_id', req.user.id);
  res.json({ ok: true, temas_bloqueados });
});

export default router;
