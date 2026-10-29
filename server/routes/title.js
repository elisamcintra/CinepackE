import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { HttpError, validarTipo } from '../lib/http.js';
import { iaResumirResenhas } from '../services/aiService.js';
import { cached, DIA } from '../services/cache.js';
import { getRatings } from '../services/omdbService.js';
import { getTitle, reviews } from '../services/tmdbService.js';

const router = Router();
router.use(requireAuth);

function lerParams(req) {
  const tipo = validarTipo(req.params.tipo);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'ID inválido.');
  return { tipo, id };
}

// GET /api/title/:tipo/:id -> detalhes completos (TMDB + OMDb + verificação Netflix + status do usuário)
router.get('/:tipo/:id', async (req, res) => {
  const { tipo, id } = lerParams(req);
  const titulo = await getTitle(tipo, id);
  if (!titulo) throw new HttpError(404, 'Título não encontrado no TMDB.');

  const [notas, meu] = await Promise.all([
    getRatings(titulo.imdb_id),
    req.db.from('user_titles').select('status, nota, motivo').eq('tmdb_id', id).eq('tipo', tipo).maybeSingle(),
  ]);
  res.json({ ...titulo, notas_externas: notas, status_usuario: meu.data?.status || null, nota_usuario: meu.data?.nota || null });
});

// GET /api/title/:tipo/:id/reviews -> resumo em português das resenhas REAIS do TMDB
router.get('/:tipo/:id/reviews', async (req, res) => {
  const { tipo, id } = lerParams(req);
  const lista = await reviews(tipo, id);
  const link = `https://www.themoviedb.org/${tipo}/${id}/reviews`;

  if (!lista.length) {
    return res.json({ total: 0, resumo: null, link, mensagem: 'Ainda não há resenhas de usuários para este título.' });
  }

  const titulo = (await getTitle(tipo, id))?.titulo || '';
  const resumo = await cached(`resenhas:${tipo}:${id}:${lista.length}`, 7 * DIA, async () =>
    (await iaResumirResenhas({ titulo, resenhas: lista })) ?? undefined
  );

  res.json({
    total: lista.length,
    resumo: resumo || null,
    link,
    // Sem IA: mostra trechos das resenhas originais (nunca inventamos opiniões)
    trechos: resumo
      ? []
      : lista.slice(0, 3).map((r) => ({
          autor: r.autor,
          nota: r.nota,
          texto: r.texto.length > 320 ? `${r.texto.slice(0, 320)}…` : r.texto,
          url: r.url,
        })),
  });
});

export default router;
