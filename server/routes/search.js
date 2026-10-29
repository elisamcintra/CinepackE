import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { buscar } from '../services/searchService.js';

const router = Router();
router.use(requireAuth);

// POST /api/search  { filtros: {...}, texto: "algo tipo Dark, mas menos confuso" }
router.post('/', async (req, res) => {
  const { filtros = {}, texto = '' } = req.body || {};
  res.json(await buscar(req.db, req.user.id, { filtros, texto: String(texto) }));
});

export default router;
