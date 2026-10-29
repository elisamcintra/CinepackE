import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { obterRecomendacoes } from '../services/recommendationService.js';

const router = Router();
router.use(requireAuth);

// GET /api/recommendations?humor=leve&tempo=ate_2h&forcar=1
//   humor:  leve | intenso | pensar | rir | chorar
//   tempo:  ate_1h30 | ate_2h | maratona
//   forcar: 1 = ignora o cache e gera de novo (botão "Atualizar recomendações")
router.get('/', async (req, res) => {
  const resultado = await obterRecomendacoes(req.db, req.user.id, {
    clima: req.query.humor || null,
    tempo: req.query.tempo || null,
    forcar: req.query.forcar === '1',
  });
  res.json(resultado);
});

export default router;
