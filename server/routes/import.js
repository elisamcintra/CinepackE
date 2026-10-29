// Importação do histórico da Netflix.
//
// REGRA: nenhuma adivinhação. Um título do histórico só é ligado a um filme/série do TMDB quando:
//   1. a linha tem nome (" : Episódio 3", sem o nome da série, é descartada);
//   2. o nome é IDÊNTICO ao nome do TMDB (em português ou no idioma original), sem contar acentos e pontuação;
//      ou idêntico a um nome oficial alternativo registrado no TMDB (ex.: "A Anatomia de Grey");
//   3. sobra UMA opção só. Se houver mais de um título com o mesmo nome (ex.: "Roma" de 1972 e de 2018),
//      nada é escolhido: as opções vão para a tela de revisão e a pessoa decide.
// Para separar homônimos, só usamos fatos, nunca popularidade:
//   - país ou ano escritos no próprio nome ("The Office (U.S.)", "Roma (2018)");
//   - a data em que a pessoa assistiu (ninguém assiste antes do lançamento);
//   - o tipo que o próprio histórico indica (vários episódios = série).

import { Router } from 'express';
import { semNome, separarQualificador } from '../../src/modules/cinematch/lib/nomesHistorico.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';
import { mapLimit } from '../lib/limit.js';
import { nomesDoResultado, normalizarNome } from '../lib/texto.js';
import { limparHistorico } from '../services/historyService.js';
import { alternativeTitles, resumoBusca, searchMulti } from '../services/tmdbService.js';

const router = Router();
router.use(requireAuth);

const MAX_OPCOES = 5;

/**
 * Filtra, entre os resultados do TMDB, os que têm EXATAMENTE o nome procurado
 * e os que sobram depois dos filtros por fatos. Não acessa a rede (fácil de testar).
 * Devolve { match } (uma opção só), { opcoes } (mais de uma: a pessoa escolhe) ou {} (nenhuma).
 */
export function escolherExato(resultados, { titulo, tipoProvavel, vistoEm, tipoForcado } = {}) {
  if (!titulo || semNome(titulo)) return {};
  const { nome, pais, ano } = separarQualificador(titulo);
  const alvos = new Set([normalizarNome(titulo), normalizarNome(nome)].filter(Boolean));

  const nomes = (r) => [...nomesDoResultado(r), ...(r.nomes_alternativos || []).map(normalizarNome)];
  let candidatos = resultados.filter((r) => nomes(r).some((n) => alvos.has(n)));
  if (tipoForcado) candidatos = candidatos.filter((r) => r.media_type === tipoForcado);

  // Fatos escritos no próprio nome
  if (ano) candidatos = candidatos.filter((r) => String(r.release_date || r.first_air_date || '').startsWith(ano));
  if (pais) candidatos = candidatos.filter((r) => (r.origin_country || []).includes(pais));

  // Não dá para ter assistido antes do lançamento
  if (vistoEm) {
    const possiveis = candidatos.filter((r) => {
      const data = r.release_date || r.first_air_date;
      return !data || data <= vistoEm;
    });
    candidatos = possiveis;
  }

  // O tipo que o histórico indica (série com vários episódios, por exemplo) desempata
  if (candidatos.length > 1 && tipoProvavel) {
    const doTipo = candidatos.filter((r) => r.media_type === tipoProvavel);
    if (doTipo.length) candidatos = doTipo;
  }

  // Resultados repetidos (mesmo ID) contam como um só
  const unicos = [...new Map(candidatos.map((r) => [`${r.media_type}:${r.id}`, r])).values()];
  if (unicos.length === 1) return { match: resumoBusca(unicos[0]) };
  if (unicos.length > 1) return { opcoes: unicos.slice(0, MAX_OPCOES).map(resumoBusca) };
  return {};
}

// Acrescenta aos primeiros resultados os nomes oficiais alternativos (para nomes brasileiros diferentes do TMDB)
async function comNomesAlternativos(resultados) {
  const primeiros = resultados.slice(0, 5);
  const alternativos = await Promise.all(primeiros.map((r) => alternativeTitles(r.media_type, r.id).catch(() => [])));
  return primeiros.map((r, i) => ({ ...r, nomes_alternativos: alternativos[i] }));
}

// Procura um título do histórico no TMDB (só nome exato; ver as regras no topo)
async function associar({ titulo, tipoProvavel, vistoEm, tituloSerie }) {
  if (!titulo || semNome(titulo)) return { motivo: 'sem_nome' };

  const resultados = await searchMulti(separarQualificador(titulo).nome);
  const r1 = escolherExato(resultados, { titulo, tipoProvavel, vistoEm });
  if (r1.match || r1.opcoes) return r1;
  // Nenhum nome idêntico: confere os nomes oficiais alternativos (também exigindo nome idêntico)
  if (resultados.length) {
    const r1b = escolherExato(await comNomesAlternativos(resultados), { titulo, tipoProvavel, vistoEm });
    if (r1b.match || r1b.opcoes) return r1b;
  }

  // Um episódio só de uma série ("Zero: Episódio 1"): procura a série "Zero", também por nome exato
  if (tituloSerie && !semNome(tituloSerie)) {
    const r2 = escolherExato(await searchMulti(tituloSerie), { titulo: tituloSerie, vistoEm, tipoForcado: 'tv' });
    if (r2.match || r2.opcoes) return r2;
  }
  return { motivo: 'nao_encontrado' };
}

const dataValida = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

// POST /api/import/netflix-csv  { titulos: [{ titulo, tipoProvavel, vistoEm, tituloSerie }] }  (no máximo 60 por vez)
// O navegador manda em lotes para mostrar a barra de progresso.
// Cada resultado: { match } (identificado), { opcoes } (homônimos: a pessoa escolhe) ou { match: null, motivo }.
router.post('/netflix-csv', async (req, res) => {
  const titulos = Array.isArray(req.body?.titulos) ? req.body.titulos : [];
  if (!titulos.length) throw new HttpError(400, 'Nenhum título enviado.');
  if (titulos.length > 60) throw new HttpError(400, 'Envie no máximo 60 títulos por vez.');

  const respostas = await mapLimit(titulos, 6, (t) =>
    associar({
      titulo: typeof t?.titulo === 'string' ? t.titulo.trim() : '',
      tipoProvavel: ['movie', 'tv'].includes(t?.tipoProvavel) ? t.tipoProvavel : null,
      vistoEm: dataValida(t?.vistoEm),
      tituloSerie: typeof t?.tituloSerie === 'string' ? t.tituloSerie.trim() : null,
    })
  );
  res.json({
    resultados: titulos.map((t, i) => ({
      titulo: t?.titulo,
      match: respostas[i].match || null,
      opcoes: respostas[i].opcoes || null,
      motivo: respostas[i].motivo || (respostas[i].opcoes ? 'homonimos' : null),
    })),
  });
});

// POST /api/import/save  { itens: [...] }
// Salva o histórico identificado e marca tudo como "Já vi" (nunca será recomendado).
// Linhas sem nome são recusadas aqui também, mesmo que cheguem por engano.
router.post('/save', async (req, res) => {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
  if (!itens.length) throw new HttpError(400, 'Nada para salvar.');
  const userId = req.user.id;

  const historico = new Map();
  const titulos = new Map();
  let recusados = 0;
  for (const i of itens) {
    if (typeof i?.titulo_original !== 'string') continue;
    if (semNome(i.titulo_original)) {
      recusados++;
      continue;
    }
    const tmdbId = Number(i.tmdb_id) || null;
    const tipo = ['movie', 'tv'].includes(i.tipo) ? i.tipo : null;
    historico.set(i.titulo_original, {
      user_id: userId,
      titulo_original: i.titulo_original.slice(0, 300),
      titulo_tmdb: i.titulo_tmdb || null,
      tmdb_id: tmdbId,
      tipo,
      episodios_vistos: Number(i.episodios_vistos) || 0,
      vezes: Number(i.vezes) || 1,
      ultima_data: i.ultima_data || null,
      peso: Number(i.peso) || 0,
      generos: Array.isArray(i.generos) ? i.generos.map(Number).filter(Boolean) : [],
      idioma_original: i.idioma_original || null,
      ano: i.ano || null,
      poster_path: i.poster_path || null,
    });
    if (tmdbId && tipo) {
      titulos.set(`${tipo}:${tmdbId}`, {
        user_id: userId,
        tmdb_id: tmdbId,
        tipo,
        status: 'ja_vi',
        origem: 'historico',
        dados: {
          titulo: i.titulo_tmdb || i.titulo_original,
          poster_path: i.poster_path || null,
          ano: i.ano || null,
          genre_ids: Array.isArray(i.generos) ? i.generos : [],
          idioma_original: i.idioma_original || null,
        },
      });
    }
  }

  // Grava em blocos de 500 linhas
  const emBlocos = async (tabela, linhas, opcoes) => {
    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await req.db.from(tabela).upsert(linhas.slice(i, i + 500), opcoes);
      if (error) throw error;
    }
  };
  // Sem ignoreDuplicates: a importação nova SUBSTITUI a associação antiga do mesmo título
  await emBlocos('watch_history_import', [...historico.values()], { onConflict: 'user_id,titulo_original' });
  // ignoreDuplicates: não sobrescreve o que o usuário já marcou/avaliou no app
  await emBlocos('user_titles', [...titulos.values()], { onConflict: 'user_id,tmdb_id,tipo', ignoreDuplicates: true });

  res.json({ ok: true, salvos: historico.size, marcados_como_vistos: titulos.size, recusados_sem_nome: recusados });
});

// POST /api/import/finalizar  { titulos_originais: [...] }
// Chamado depois do último lote do /save: o histórico recém-importado vira o histórico oficial.
router.post('/finalizar', async (req, res) => {
  const lista = Array.isArray(req.body?.titulos_originais) ? req.body.titulos_originais.filter((t) => typeof t === 'string') : null;
  if (!lista?.length) throw new HttpError(400, 'Lista do histórico vazia.');
  const removidos = await limparHistorico(req.db, { manter: lista.map((t) => t.slice(0, 300)) });
  await req.db.from('recommendation_cache').delete().eq('user_id', req.user.id);
  res.json({ ok: true, removidos });
});

export default router;
