import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { HttpError, validarTipo } from '../lib/http.js';
import { AVALIACOES_PARA_ATUALIZAR, avaliacoesDesde, carregarPerfil, gerarPerfil } from '../services/profileService.js';

const router = Router();
router.use(requireAuth);

const STATUS = ['ja_vi', 'quero_ver', 'nao_interessa'];
const atualizandoPerfil = new Set(); // evita duas atualizações simultâneas do mesmo usuário

// Só guardamos o necessário para mostrar o título nas listas, sem buscar no TMDB de novo
function limparDados(d = {}) {
  return {
    titulo: typeof d.titulo === 'string' ? d.titulo.slice(0, 300) : '',
    titulo_original: typeof d.titulo_original === 'string' ? d.titulo_original.slice(0, 300) : null,
    poster_path: typeof d.poster_path === 'string' ? d.poster_path : null,
    ano: d.ano ? String(d.ano).slice(0, 4) : null,
    genre_ids: Array.isArray(d.genre_ids) ? d.genre_ids.map(Number).filter(Boolean).slice(0, 10) : [],
    idioma_original: typeof d.idioma_original === 'string' ? d.idioma_original.slice(0, 5) : null,
    nota_tmdb: Number(d.nota_tmdb) || null,
  };
}

function validarItem(i) {
  const tipo = validarTipo(i?.tipo);
  const tmdbId = Number(i?.tmdb_id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new HttpError(400, 'ID inválido.');
  if (!STATUS.includes(i.status)) throw new HttpError(400, 'Status inválido.');
  const nota = i.nota === null || i.nota === undefined || i.nota === '' ? null : Number(i.nota);
  if (nota !== null && !(Number.isInteger(nota) && nota >= 1 && nota <= 5)) throw new HttpError(400, 'Nota deve ser de 1 a 5.');
  return {
    tmdb_id: tmdbId,
    tipo,
    status: i.status,
    nota: i.status === 'ja_vi' ? nota : null,
    motivo: i.status === 'nao_interessa' && typeof i.motivo === 'string' ? i.motivo.slice(0, 300) : null,
    dados: limparDados(i.dados),
    origem: typeof i.origem === 'string' ? i.origem.slice(0, 30) : 'app',
    atualizado_em: new Date().toISOString(),
  };
}

// A cada 5 avaliações novas, recalcula o perfil em segundo plano
async function talvezAtualizarPerfil(req) {
  const userId = req.user.id;
  if (atualizandoPerfil.has(userId)) return false;
  const linha = await carregarPerfil(req.db);
  if (!linha) return false;
  const novas = await avaliacoesDesde(req.db, linha.atualizado_em);
  if (novas < AVALIACOES_PARA_ATUALIZAR) return false;

  atualizandoPerfil.add(userId);
  gerarPerfil(req.db, userId)
    .then(() => console.log(`[perfil] atualizado automaticamente (${novas} avaliações novas)`))
    .catch((e) => console.warn('[perfil] falha na atualização automática:', e.message))
    .finally(() => atualizandoPerfil.delete(userId));
  return true;
}

// GET /api/user-titles?status=quero_ver
router.get('/', async (req, res) => {
  let q = req.db.from('user_titles').select('tmdb_id, tipo, status, nota, motivo, origem, dados, atualizado_em').order('atualizado_em', { ascending: false });
  if (STATUS.includes(req.query.status)) q = q.eq('status', req.query.status);
  const { data, error } = await q.limit(2000);
  if (error) throw error;
  res.json({ itens: data });
});

// POST /api/user-titles  { tmdb_id, tipo, status, nota?, motivo?, dados }
router.post('/', async (req, res) => {
  const item = { ...validarItem(req.body), user_id: req.user.id };
  const { error } = await req.db.from('user_titles').upsert(item, { onConflict: 'user_id,tmdb_id,tipo' });
  if (error) throw error;
  const perfilAtualizando = await talvezAtualizarPerfil(req).catch(() => false);
  res.json({ ok: true, perfil_atualizando: perfilAtualizando });
});

// POST /api/user-titles/lote  { itens: [...] }  (avaliação rápida depois da importação)
router.post('/lote', async (req, res) => {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 100) : [];
  if (!itens.length) return res.json({ ok: true, salvos: 0 });
  const linhas = itens.map((i) => ({ ...validarItem(i), user_id: req.user.id }));
  const { error } = await req.db.from('user_titles').upsert(linhas, { onConflict: 'user_id,tmdb_id,tipo' });
  if (error) throw error;
  res.json({ ok: true, salvos: linhas.length });
});

// DELETE /api/user-titles/:tipo/:id  -> tira o título de qualquer lista
router.delete('/:tipo/:id', async (req, res) => {
  const tipo = validarTipo(req.params.tipo);
  const { error } = await req.db.from('user_titles').delete().eq('tipo', tipo).eq('tmdb_id', Number(req.params.id));
  if (error) throw error;
  res.json({ ok: true });
});

export default router;
