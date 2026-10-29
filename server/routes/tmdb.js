import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { GENEROS } from '../lib/genres.js';
import { IDIOMAS } from '../lib/languages.js';
import { resumoBusca, searchMulti } from '../services/tmdbService.js';

const router = Router();

// GET /api/tmdb/search?q=dark  -> autocompletar (quiz pergunta 10 e correção da importação)
router.get('/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ resultados: [] });
  const resultados = (await searchMulti(q)).slice(0, 8).map(resumoBusca);
  res.json({ resultados });
});

// GET /api/tmdb/genres -> lista de gêneros e idiomas para os filtros (em português)
router.get('/genres', (req, res) => {
  res.json({
    generos: GENEROS.map(({ chave, nome, movie, tv, tvKeyword }) => ({
      chave,
      nome,
      filmes: movie.length > 0,
      series: tv.length > 0 || !!tvKeyword,
    })),
    idiomas: Object.entries(IDIOMAS).map(([codigo, nome]) => ({ codigo, nome })),
  });
});

export default router;
