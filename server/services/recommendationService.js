// Monta o catálogo "Para você".
//
// 1. Junta candidatos de várias fontes:
//    a. "Sementes": até 10 títulos que a pessoa amou -> recomendações do TMDB de cada um.
//       Um candidato que aparece a partir de VÁRIAS sementes é um sinal forte (consenso).
//    a2. MovieLens: os 40 filmes com maior sinal colaborativo, calculado com TODOS os filmes
//       da pessoa que existem na base (movielensBase.js), cada um com seu peso.
//    b. Sugestões da IA (conhecimento de cinema), procuradas no TMDB pelo nome.
//    c. /discover com os gêneros, idiomas e palavras-chave do perfil.
// 2. Verifica CADA um na Netflix BR (netflixCheck) e remove os já vistos/descartados.
// 3. Se sobrarem menos de 15, amplia a busca automaticamente.
// 4. Pontua (assinatura de gosto + consenso + MovieLens + qualidade...), garante variedade (MMR)
//    e, se a IA estiver disponível, ela escolhe os melhores, dá a % de compatibilidade e explica.
// 5. O resultado ("pool") fica em cache; o humor do dia só reordena esse pool.

import { HttpError } from '../lib/http.js';
import { mapLimit } from '../lib/limit.js';
import { anoDoResultado, nomesDoResultado, normalizarNome } from '../lib/texto.js';
import { iaDisponivel, iaRanquear, iaSugerirTitulos } from './aiService.js';
import { TEMAS_BLOQUEAVEIS } from '../lib/temas.js';
import { carregarBase } from './movielensBase.js';
import * as movielens from './movielensService.js';
import { cached, DIA } from './cache.js';
import { chaveTitulo, descobrirVerificados, verificarVarios } from './netflixCheck.js';
import { getRatings } from './omdbService.js';
import { carregarPerfil } from './profileService.js';
import { aplicarHumor, compatibilidadePorScore, diversificar, motivoPorRegras, pontuar } from './scoring.js';
import { recommendations, searchMulti } from './tmdbService.js';
import { chavesDoTitulo, nomeGenero } from '../lib/genres.js';
import { nomeIdioma } from '../lib/languages.js';

export const MINIMO = 10;
const TAMANHO_POOL = 40;
const MAX_SEMENTES = 10;

// Conjunto "tipo:id" de tudo que não pode ser recomendado (+ nomes vistos, para a IA não sugerir de novo)
export async function carregarExcluidos(db) {
  const { data, error } = await db.from('user_titles').select('tmdb_id, tipo, status, dados, atualizado_em');
  if (error) throw error;
  const excluir = new Set();
  const status = new Map();
  const vistos = [];
  for (const t of data || []) {
    const k = chaveTitulo(t.tipo, t.tmdb_id);
    status.set(k, t.status);
    if (t.status === 'ja_vi' || t.status === 'nao_interessa') {
      excluir.add(k);
      if (t.dados?.titulo) vistos.push({ titulo: t.dados.titulo, quando: t.atualizado_em });
    }
  }
  const nomesVistos = vistos
    .sort((a, b) => String(b.quando).localeCompare(String(a.quando)))
    .slice(0, 80)
    .map((v) => v.titulo);
  return { excluir, status, nomesVistos };
}

// Remove campos pesados que o card não usa (o pool fica guardado no banco)
export function paraCard(t) {
  const { elenco, palavras_chave, ...resto } = t;
  return { ...resto, palavras_chave: (palavras_chave || []).slice(0, 8) };
}

// Formato compacto de um candidato para enviar à IA (economiza tokens)
export function candidatoParaIA(x) {
  const { t, sinais = {} } = x;
  return {
    id: chaveTitulo(t.tipo, t.tmdb_id),
    titulo: t.titulo,
    original: t.titulo_original !== t.titulo ? t.titulo_original : undefined,
    tipo: t.tipo === 'tv' ? `série (${t.temporadas || '?'} temp.)` : `filme (${t.duracao || '?'} min)`,
    ano: t.ano,
    generos: chavesDoTitulo(t.tipo, t.genre_ids).map(nomeGenero),
    idioma: nomeIdioma(t.idioma_original),
    direcao: (t.diretores || []).slice(0, 2).join(', ') || undefined,
    palavras_chave: (t.palavras_chave || []).slice(0, 6).map((k) => k.nome),
    sinopse: (t.sinopse || '').slice(0, 260),
    sinais: {
      nota_ajustada: x.notaAjustada,
      parecido_com: sinais.nomesSementes?.slice(0, 3),
      temas_em_comum: x.destaques?.map((d) => d.texto),
      alerta: x.alertas?.length ? x.alertas.map((d) => d.texto) : undefined,
      sugestao_da_ia: sinais.porQueIA || undefined,
      movielens: sinais.movielens?.melhor
        ? `quem gostou de ${sinais.movielens.contribuintes.filter((c) => c.contribuicao > 0).slice(0, 3).map((c) => `"${c.titulo}"`).join(', ')} também gostou deste (sinal ${sinais.movielens.pontos} de 3)`
        : undefined,
    },
  };
}

/**
 * Ordena uma lista de títulos para o perfil.
 * 1) pontua por regras  2) garante variedade  3) a IA escolhe/explica (se disponível)
 * sinais: Map("tipo:id" -> { parecidoCom, sementes, nomesSementes, sugeridoPorIA, porQueIA })
 * Devolve os itens com `motivo`, `motivo_por` ('ia' | 'regras') e `compatibilidade` (0-100).
 */
// Temas bloqueados pela pessoa (ex.: video games): o título sai de vez da lista
export function bloqueado(t, perfil) {
  const b = perfil?.temas_bloqueados;
  if (!b) return false;
  const kws = new Set(b.palavras_chave || []);
  if ((t.palavras_chave || []).some((k) => kws.has(k.id))) return true;
  return (b.generos || []).some((g) => chavesDoTitulo(t.tipo, t.genre_ids || []).includes(g));
}

export async function ranquear(titulos, perfil, { sinais = new Map(), quantidadeIA = 15, contexto = '', escalaMovielens = movielens.ESCALA_PADRAO } = {}) {
  // Sinal do MovieLens com a base inteira da pessoa (todos os filmes dela que a base conhece)
  const calc = movielens.calcularBase(perfil?.base_movielens);
  const candidatos = titulos.filter((t) => !bloqueado(t, perfil));
  const sinaisMl = new Map();
  if (calc) {
    for (const t of candidatos) if (t.tipo === 'movie') sinaisMl.set(t.tmdb_id, movielens.sinalDoCandidato(calc, t.tmdb_id, escalaMovielens));
    if (escalaMovielens.centrar && sinaisMl.size) {
      const media = [...sinaisMl.values()].reduce((a, x) => a + x.pontos, 0) / sinaisMl.size;
      for (const x of sinaisMl.values()) {
        x.pontos_antes_de_centrar = x.pontos;
        x.pontos = Math.round((x.pontos - media) * 100) / 100;
      }
    }
  }
  const pontuados = candidatos
    .map((t) => {
      const sn = { ...(sinais.get(chaveTitulo(t.tipo, t.tmdb_id)) || {}) };
      if (t.tipo === 'movie' && sinaisMl.has(t.tmdb_id)) sn.movielens = sinaisMl.get(t.tmdb_id);
      const p = pontuar(t, perfil, sn);
      return { t, sinais: sn, ...p };
    })
    .sort((a, b) => b.score - a.score);
  // Rastreamento: quanto cada componente somou e quais títulos da pessoa geraram o sinal do MovieLens
  const rastrear = (x) => ({
    total: x.score,
    componentes: x.componentes,
    origem: [x.sinais.parecidoCom && 'sementes_tmdb', x.sinais.sugeridoPorIA && 'sugestao_ia', x.sinais.deMovielens && 'movielens'].filter(Boolean),
    movielens:
      x.t.tipo === 'tv'
        ? { aplicavel: false, motivo: 'O MovieLens só tem filmes.' }
        : {
            aplicavel: !!calc,
            base: perfil?.base_movielens
              ? { disponiveis: perfil.base_movielens.disponiveis, alfa: perfil.base_movielens.alfa, aviso: perfil.base_movielens.aviso }
              : null,
            S: x.sinais.movielens?.S ?? 0,
            pontos: x.sinais.movielens?.pontos ?? 0,
            modelo: calc?.modelo || null,
            escala: { ...escalaMovielens, forca_da_base: calc?.forca ?? null, antes_de_centrar: x.sinais.movielens?.pontos_antes_de_centrar ?? null },
            quantos_titulos_seus: x.sinais.movielens?.quantos ?? 0,
            contribuintes: (x.sinais.movielens?.contribuintes || []).map(({ tmdb_id, titulo, peso, sim, contribuicao }) => ({ tmdb_id, titulo, peso, sim, contribuicao })),
          },
  });
  const variados = diversificar(pontuados, { quantidade: 45 });

  const comRegras = (x) => ({
    ...paraCard(x.t),
    score: x.score,
    compatibilidade: compatibilidadePorScore(x.score),
    parecido_com: x.sinais.parecidoCom || null,
    temas_em_comum: (x.destaques || []).filter((d) => d.tipo === 'tema').map((d) => d.texto),
    // Regra de associação minerada do MovieLens (para o card mostrar "62% de quem amou X…")
    movielens:
      x.sinais.movielens?.melhor && x.componentes.movielens > 0
        ? {
            de: x.sinais.movielens.melhor.titulo,
            confianca: Math.round(x.sinais.movielens.melhor.confianca * 100) / 100,
            lift: Math.round(x.sinais.movielens.melhor.lift * 10) / 10,
            pontos: x.componentes.movielens,
          }
        : null,
    rastreamento: rastrear(x),
    motivo: motivoPorRegras(x.t, x.razoes),
    motivo_por: 'regras',
  });

  if (!perfil || !iaDisponivel() || variados.length < 2) return variados.map(comRegras);

  const topo = variados.slice(0, 30);
  const escolhidos = await iaRanquear({
    perfil,
    candidatos: topo.map(candidatoParaIA),
    quantidade: Math.min(quantidadeIA, topo.length),
    contexto,
  });
  if (!escolhidos) return variados.map(comRegras);

  const porId = new Map(variados.map((x) => [chaveTitulo(x.t.tipo, x.t.tmdb_id), x]));
  const usados = new Set();
  const ordenados = [];
  for (const e of escolhidos) {
    const x = porId.get(e.id);
    if (!x) continue;
    usados.add(e.id);
    const regras = comRegras(x);
    ordenados.push({
      ...regras,
      // A % final mistura a opinião da IA (70%) com a conta das regras (30%)
      compatibilidade: e.compatibilidade != null ? Math.round(e.compatibilidade * 0.7 + regras.compatibilidade * 0.3) : regras.compatibilidade,
      motivo: e.motivo.trim(),
      motivo_por: 'ia',
      rastreamento: {
        ...regras.rastreamento,
        ia: { escolhido: true, posicao: ordenados.length + 1, compatibilidade_ia: e.compatibilidade ?? null, compatibilidade_regras: regras.compatibilidade },
      },
    });
  }
  // Os que a IA não escolheu continuam no final (com motivo por regras)
  for (const [id, x] of porId) if (!usados.has(id)) ordenados.push(comRegras(x));
  return ordenados;
}

// Junta as notas do OMDb (IMDb, Rotten Tomatoes, Metacritic) nos itens
export async function anexarNotas(itens) {
  const notas = await mapLimit(itens, 4, (t) => getRatings(t.imdb_id));
  return itens.map((t, i) => ({ ...t, notas_externas: notas[i] || null }));
}

// ---------- Fontes de candidatos ----------

// a. Sementes: recomendações do TMDB a partir de cada favorito, contando o consenso
async function candidatosDasSementes(perfil, excluir, sinais) {
  const vistos = new Set();
  const sementes = [...(perfil.titulos_ancora || []), ...(perfil.sementes || [])]
    .filter((s) => {
      const k = chaveTitulo(s.tipo, s.tmdb_id);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, MAX_SEMENTES);

  const listas = await mapLimit(sementes, 4, (s) => recommendations(s.tipo, s.tmdb_id));
  const refs = [];
  const registrar = (tipo, id, semente) => {
    const k = chaveTitulo(tipo, id);
    if (excluir.has(k)) return;
    const atual = sinais.get(k);
    if (atual?.nomesSementes) {
      if (atual.nomesSementes.includes(semente.titulo)) return; // mesma semente por duas fontes conta uma vez
      atual.sementes++;
      atual.nomesSementes.push(semente.titulo);
    } else {
      sinais.set(k, { ...atual, parecidoCom: semente.titulo, sementes: 1, nomesSementes: [semente.titulo] });
      refs.push({ tipo, id });
    }
  };
  listas.forEach((lista, i) => {
    for (const r of (lista || []).slice(0, 20)) registrar(r.media_type, r.id, sementes[i]);
  });
  // Prioriza os de maior consenso (até 80 verificações na Netflix)
  return refs.sort((a, b) => sinais.get(chaveTitulo(b.tipo, b.id)).sementes - sinais.get(chaveTitulo(a.tipo, a.id)).sementes).slice(0, 80);
}

// b. Sugestões da IA: procura cada nome no TMDB (tipo + ano batendo) antes de usar
async function resolverSugestao(s) {
  const buscar = async (q) => (q ? (await searchMulti(q)).filter((r) => r.media_type === s.tipo) : []);
  let resultados = await buscar(s.titulo_original);
  if (!resultados.length && s.titulo !== s.titulo_original) resultados = await buscar(s.titulo);
  if (!resultados.length) return null;

  // Precisão acima de tudo: o nome E o ano precisam bater (evita trocar um filme pelo remake)
  const alvos = [normalizarNome(s.titulo_original), normalizarNome(s.titulo)];
  const nomeBate = (r) => nomesDoResultado(r).some((n) => alvos.includes(n));
  const anoBate = (r) => !s.ano || (anoDoResultado(r) && Math.abs(anoDoResultado(r) - s.ano) <= 1);
  const achado = resultados.find((r) => nomeBate(r) && anoBate(r));
  return achado ? { tipo: s.tipo, id: achado.id } : null;
}

async function candidatosDaIA(perfil, excluir, sinais, nomesVistos, chaveCache) {
  if (!iaDisponivel()) return [];
  const sugestoes = await cached(chaveCache, DIA, async () =>
    (await iaSugerirTitulos({
      perfil,
      amados: (perfil.sementes || perfil.titulos_ancora || []).slice(0, 12).map((s) => s.titulo),
      rejeitados: (perfil.rejeitados || []).slice(0, 8).map((s) => s.titulo),
      jaVistos: nomesVistos.slice(0, 60),
      formato: perfil.duracao_preferida,
    })) ?? undefined
  );
  if (!sugestoes) return [];

  const resolvidas = await mapLimit(sugestoes, 4, resolverSugestao);
  const refs = [];
  resolvidas.forEach((r, i) => {
    if (!r) return;
    const k = chaveTitulo(r.tipo, r.id);
    if (excluir.has(k)) return;
    sinais.set(k, { ...sinais.get(k), sugeridoPorIA: true, porQueIA: sugestoes[i].por_que });
    refs.push(r);
  });
  console.log(`[sugestoes-ia] ${refs.length} de ${sugestoes.length} encontradas no TMDB`);
  return refs;
}

// ---------- Geração do pool ----------

async function gerarPool(perfil, excluir, { nomesVistos = [], chaveSugestoes }) {
  const formato = perfil.duracao_preferida;
  const tipos = formato === 'filmes_curtos' ? ['movie'] : ['movie', 'tv'];
  const filtroFormato = (t) => {
    if (formato === 'filmes_curtos') return t.tipo === 'movie' && (!t.duracao || t.duracao <= 135);
    if (formato === 'filmes_ou_minisseries') return t.tipo === 'movie' || (t.temporadas ?? 1) <= 1;
    return true;
  };
  const filtro = (t) => !excluir.has(chaveTitulo(t.tipo, t.tmdb_id)) && filtroFormato(t);

  const favoritos = (perfil.generos_favoritos || []).slice(0, 3).map((g) => g.chave);
  // Só exclui de vez gêneros evitados com força e sem nuance
  const evitar = (perfil.generos_evitar || []).filter((g) => (g.forca ?? 0.7) >= 0.6 && !g.nuance).map((g) => g.chave);
  const idiomas = perfil.idiomas_preferidos || [];
  const kwIds = (perfil.palavras_chave || []).map((p) => p.id).filter(Boolean);

  const consultas = [];
  for (const tipo of tipos) {
    consultas.push({ tipo, generos: favoritos, excluirGeneros: evitar, votosMin: 200, ordenar: 'nota' });
    consultas.push({ tipo, generos: favoritos, excluirGeneros: evitar, votosMin: 100 });
    if (idiomas.length) consultas.push({ tipo, generos: favoritos.slice(0, 2), idiomas, excluirGeneros: evitar, votosMin: 30 });
    if (kwIds.length) consultas.push({ tipo, palavrasChave: kwIds, excluirGeneros: evitar, votosMin: 50 });
  }

  const sinais = new Map();
  // a2. Candidatos que vêm só do MovieLens (os 40 de maior sinal com a base inteira da pessoa)
  const refsMovielens = movielens.melhoresDaBase(movielens.calcularBase(perfil.base_movielens), 40, excluir).map((id) => {
    const k = chaveTitulo('movie', id);
    sinais.set(k, { ...sinais.get(k), deMovielens: true });
    return { tipo: 'movie', id };
  });
  const [refsSementes, refsIA] = await Promise.all([
    candidatosDasSementes(perfil, excluir, sinais),
    candidatosDaIA(perfil, excluir, sinais, nomesVistos, chaveSugestoes).catch((e) => {
      console.warn('[sugestoes-ia]', e.message);
      return [];
    }),
  ]);

  const [verificados, ...deConsultas] = await Promise.all([
    verificarVarios([...refsSementes, ...refsIA, ...refsMovielens], filtro),
    ...consultas.map((c) => descobrirVerificados(c, { alvo: 12, maxPaginas: 2, excluir, filtroExtra: filtro })),
  ]);

  const unicos = new Map();
  for (const t of [...verificados, ...deConsultas.flat()]) unicos.set(chaveTitulo(t.tipo, t.tmdb_id), t);

  // Garantia de mínimo: amplia com filtros mais flexíveis até ter pelo menos 15 candidatos
  const ampliacoes = [
    ...tipos.map((tipo) => ({ tipo, generos: favoritos.slice(0, 1), votosMin: 50 })),
    ...tipos.map((tipo) => ({ tipo, excluirGeneros: evitar, votosMin: 500, ordenar: 'nota' })),
    ...tipos.map((tipo) => ({ tipo, votosMin: 200 })),
  ];
  for (const c of ampliacoes) {
    if (unicos.size >= 15) break;
    const mais = await descobrirVerificados(c, { alvo: 15, maxPaginas: 5, excluir, filtroExtra: filtro });
    for (const t of mais) unicos.set(chaveTitulo(t.tipo, t.tmdb_id), t);
  }

  console.log(
    `[pool] ${unicos.size} candidatos verificados na Netflix (sementes: ${refsSementes.length}, IA: ${refsIA.length}, MovieLens: ${refsMovielens.length}, discover: ${deConsultas.flat().length})`
  );
  const ranqueados = await ranquear([...unicos.values()], perfil, { sinais });
  return ranqueados.slice(0, TAMANHO_POOL);
}

// ---------- API pública ----------

export async function obterRecomendacoes(db, userId, { clima, tempo, forcar } = {}) {
  const linhaPerfil = await carregarPerfil(db);
  if (!linhaPerfil) throw new HttpError(404, 'Você ainda não tem um perfil de gosto. Faça o quiz ou importe o histórico.');
  // A base do MovieLens é montada na hora: notas novas já contam, sem esperar o perfil ser recalculado
  const perfil = { ...linhaPerfil.perfil, base_movielens: await carregarBase(db) };
  // Temas bloqueados também vão para a IA, para ela nem sugerir
  const nomesBloqueados = (perfil.temas_bloqueados?.ids || []).map((id) => TEMAS_BLOQUEAVEIS[id]?.nome).filter(Boolean);
  if (nomesBloqueados.length) perfil.evitar = [...new Set([...(perfil.evitar || []), ...nomesBloqueados])];

  const { excluir, status, nomesVistos } = await carregarExcluidos(db);

  const { data: cache } = await db.from('recommendation_cache').select('itens, gerado_em').maybeSingle();
  const cacheValido =
    !forcar &&
    cache &&
    new Date(cache.gerado_em) >= new Date(linhaPerfil.atualizado_em) &&
    Date.now() - new Date(cache.gerado_em).getTime() < DIA;

  let pool = cacheValido ? cache.itens : null;
  let geradoEm = cacheValido ? cache.gerado_em : null;

  // Se muitos itens do cache já foram marcados, gera de novo
  const disponiveis = (pool || []).filter((t) => !excluir.has(chaveTitulo(t.tipo, t.tmdb_id)));
  if (!pool || disponiveis.length < MINIMO + 2) {
    pool = await gerarPool(perfil, excluir, {
      nomesVistos,
      // As sugestões da IA valem para esta versão do perfil (o botão "Atualizar" pede uma rodada nova)
      chaveSugestoes: `sugestoes:${userId}:${perfil.gerado_em}:${forcar ? Date.now() : 'base'}`,
    });
    geradoEm = new Date().toISOString();
    const { error } = await db.from('recommendation_cache').upsert({ user_id: userId, itens: pool, gerado_em: geradoEm });
    if (error) console.warn('[recommendation_cache]', error.message);
  }

  const livres = pool.filter((t) => !excluir.has(chaveTitulo(t.tipo, t.tmdb_id)));
  const { itens: comHumor, aviso: avisoHumor } = aplicarHumor(livres, { clima, tempo }, MINIMO);
  const finais = await anexarNotas(comHumor.slice(0, 20));

  let aviso = avisoHumor;
  if (finais.length < MINIMO) {
    aviso = `Encontramos só ${finais.length} títulos verificados na Netflix Brasil para o seu perfil agora. Avalie mais títulos ou use a Pesquisa para ampliar.`;
  }

  return {
    itens: finais.map((t) => ({ ...t, status_usuario: status.get(chaveTitulo(t.tipo, t.tmdb_id)) || null })),
    gerado_em: geradoEm,
    aviso,
    movielens_base: { disponiveis: perfil.base_movielens.disponiveis, minimo: perfil.base_movielens.minimo, alfa: perfil.base_movielens.alfa, aviso: perfil.base_movielens.aviso },
  };
}
