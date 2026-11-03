// Gera o PERFIL DE GOSTO do usuário juntando:
//   - respostas do quiz (o que a pessoa diz gostar)
//   - histórico da Netflix (o que ela realmente assiste, com pesos)
//   - avaliações feitas no app (Já vi com nota, Não me interessa)
//
// Passo 1: um perfil "base" é calculado por regras simples (sempre funciona).
// Passo 2: a "assinatura de gosto" junta temas, diretores e elenco dos favoritos (tasteSignature.js).
// Passo 3: se a IA estiver disponível, ela refina o perfil e detecta nuances/conflitos.
// Passo 4: palavras-chave viram IDs do TMDB e o perfil é salvo no Supabase.
// Extra: o que a mineração do MovieLens diz sobre os filmes favoritos (regras e famílias de gosto).

import { perguntaPorId } from '../../src/modules/cinematch/data/quizQuestions.js';
import { semNome } from '../../src/modules/cinematch/lib/nomesHistorico.js';
import { CHAVES_GENERO, chavesDoTitulo, nomeGenero } from '../lib/genres.js';
import { IDIOMAS, adjetivoIdioma, nomeIdioma } from '../lib/languages.js';
import { mapLimit } from '../lib/limit.js';
import { iaGerarPerfil, iaDisponivel } from './aiService.js';
import * as movielens from './movielensService.js';
import { limparHistorico } from './historyService.js';
import { montarBase } from './movielensBase.js';
import { montarBaseSeries, prepararSeries } from './seriesService.js';
import { construirAssinatura, resumoAssinatura } from './tasteSignature.js';
import { getTitle, keywordId } from './tmdbService.js';

const FORMATOS = ['filmes_curtos', 'filmes_ou_minisseries', 'qualquer', 'depende'];
export const AVALIACOES_PARA_ATUALIZAR = 5;

// ---------- Leitura dos dados do usuário ----------

export async function carregarDadosUsuario(db) {
  const [quiz, hist, titulos] = await Promise.all([
    db.from('quiz_answers').select('question_id, option_ids, comentario'),
    db
      .from('watch_history_import')
      .select('titulo_original, titulo_tmdb, tmdb_id, tipo, episodios_vistos, vezes, ultima_data, peso, generos, idioma_original, ano, poster_path')
      .order('peso', { ascending: false })
      .limit(3000),
    db.from('user_titles').select('tmdb_id, tipo, status, nota, motivo, origem, dados, atualizado_em'),
  ]);
  for (const r of [quiz, hist, titulos]) if (r.error) throw r.error;
  return {
    quiz: quiz.data || [],
    // Linhas sem nome (" : Episódio 3") nunca contam, mesmo que tenham ficado de uma importação antiga
    historico: (hist.data || []).filter((h) => !semNome(h.titulo_original)),
    titulos: titulos.data || [],
  };
}

export async function carregarPerfil(db) {
  const { data, error } = await db.from('taste_profiles').select('perfil, fonte, atualizado_em').maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Passo 1: perfil por regras ----------

function construirPerfilBase({ quiz, historico, titulos }, ancorasQuiz) {
  const score = {};
  const somar = (k, v) => CHAVES_GENERO.includes(k) && (score[k] = (score[k] || 0) + v);
  const idiomas = {};
  const tom = new Set();
  const evitar = new Set();
  const palavras = new Set();
  const nuances = [];
  let formato = 'qualquer';

  // Quiz
  for (const resp of quiz) {
    const q = perguntaPorId(resp.question_id);
    if (!q || q.tipo === 'titulos') continue;
    for (const opId of resp.option_ids || []) {
      const s = q.opcoes.find((o) => o.id === opId)?.signals;
      if (!s) continue;
      for (const [k, v] of Object.entries(s.generos || {})) somar(k, v);
      for (const l of s.idiomas || []) idiomas[l] = (idiomas[l] || 0) + 1;
      (s.tom || []).forEach((t) => tom.add(t));
      (s.evitar || []).forEach((t) => evitar.add(t));
      (s.palavras_chave || []).forEach((t) => palavras.add(t));
      if (s.formato) formato = s.formato;
      if (s.nuance) nuances.push(s.nuance);
    }
  }

  // Histórico: participação de cada gênero/idioma no que a pessoa assistiu
  const identificados = historico.filter((h) => h.tmdb_id);
  const pesoTotal = identificados.reduce((s, h) => s + Math.max(h.peso || 0, 0), 0) || 1;
  const participacao = {};
  const idiomaHist = {};
  for (const h of identificados) {
    const p = Math.max(h.peso || 0, 0) / pesoTotal;
    for (const k of chavesDoTitulo(h.tipo, h.generos || [])) {
      participacao[k] = (participacao[k] || 0) + p;
      if ((h.peso || 0) < 0) somar(k, -0.05); // séries abandonadas pesam contra
    }
    if (h.idioma_original) idiomaHist[h.idioma_original] = (idiomaHist[h.idioma_original] || 0) + p;
  }
  for (const [k, p] of Object.entries(participacao)) somar(k, p * 2);
  for (const [l, p] of Object.entries(idiomaHist)) {
    if (l !== 'en' && p >= 0.12) idiomas[l] = (idiomas[l] || 0) + 1;
  }

  // Avaliações no app
  for (const t of titulos) {
    const chaves = chavesDoTitulo(t.tipo, t.dados?.genre_ids || []);
    if (t.status === 'ja_vi' && t.nota) chaves.forEach((k) => somar(k, (t.nota - 3) * 0.15));
    if (t.status === 'nao_interessa') {
      const forte = /g[eê]nero/i.test(t.motivo || '');
      chaves.forEach((k) => somar(k, forte ? -0.3 : -0.08));
    }
  }

  const ordenados = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const max = Math.max(ordenados[0]?.[1] || 1, 0.01);
  const favoritos = ordenados
    .filter(([, v]) => v >= 0.3)
    .slice(0, 6)
    .map(([chave, v]) => ({ chave, nome: nomeGenero(chave), peso: Math.round(Math.min(1, v / max) * 100) / 100 }));

  const evitarGeneros = ordenados
    .filter(([, v]) => v <= -0.3)
    .reverse()
    .slice(0, 5)
    .map(([chave, v]) => {
      // Conflito: diz evitar, mas o gênero aparece bastante no histórico
      const conflito = (participacao[chave] || 0) >= 0.08;
      return {
        chave,
        nome: nomeGenero(chave),
        forca: Math.round(Math.min(1, -v) * 100) / 100,
        nuance: conflito ? 'diz evitar, mas aparece com frequência no seu histórico' : null,
      };
    });

  const somenteQualquer =
    quiz.some((r) => r.question_id === 6 && r.option_ids?.includes('qualquer_pais')) && !Object.keys(idiomas).length;
  const idiomasPreferidos = somenteQualquer
    ? []
    : Object.entries(idiomas).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l]) => l);

  // Âncoras: títulos citados no quiz + os que a pessoa amou (nota 5) + os mais assistidos
  const ancoras = [...ancorasQuiz];
  const add = (a) => {
    if (ancoras.length >= 6 || ancoras.some((x) => x.tmdb_id === a.tmdb_id && x.tipo === a.tipo)) return;
    ancoras.push(a);
  };
  titulos
    .filter((t) => t.status === 'ja_vi' && t.nota === 5)
    .forEach((t) => add({ tmdb_id: t.tmdb_id, tipo: t.tipo, titulo: t.dados?.titulo || '', poster_path: t.dados?.poster_path || null }));
  if (ancoras.length < 3) {
    identificados
      .filter((h) => (h.peso || 0) >= 0.7)
      .slice(0, 3)
      .forEach((h) => add({ tmdb_id: h.tmdb_id, tipo: h.tipo, titulo: h.titulo_tmdb || h.titulo_original, poster_path: h.poster_path }));
  }

  const perfil = {
    generos_favoritos: favoritos,
    generos_evitar: evitarGeneros,
    palavras_chave: [...palavras].slice(0, 8).map((termo) => ({ termo, id: null })),
    idiomas_preferidos: idiomasPreferidos,
    tom: [...tom].slice(0, 10),
    evitar: [...evitar].slice(0, 10),
    titulos_ancora: ancoras,
    duracao_preferida: formato,
  };
  perfil.resumo = resumoPorRegras(perfil, nuances);
  return { perfil, participacao };
}

function resumoPorRegras(p, nuances) {
  const partes = [];
  const favs = p.generos_favoritos.slice(0, 3).map((g) => g.nome.toLowerCase());
  if (favs.length) {
    const lista = favs.length > 1 ? `${favs.slice(0, -1).join(', ')} e ${favs.at(-1)}` : favs[0];
    let frase = `Você curte ${lista}`;
    if (p.idiomas_preferidos.length) {
      frase += `, com queda por produções ${p.idiomas_preferidos.slice(0, 2).map(adjetivoIdioma).join(' e ')}`;
    }
    partes.push(frase + '.');
  }
  if (p.generos_evitar.length) {
    partes.push(`Costuma evitar ${p.generos_evitar.map((g) => g.nome.toLowerCase()).join(', ')}.`);
  }
  if (p.tom.length) partes.push(`Gosta de obras com tom ${p.tom.slice(0, 3).join(', ')}.`);
  if (nuances.length) partes.push(nuances[0]);
  if (p.titulos_ancora.length) {
    partes.push(`Suas referências: ${p.titulos_ancora.slice(0, 3).map((a) => a.titulo).filter(Boolean).join(', ')}.`);
  }
  return partes.join(' ') || 'Ainda estamos conhecendo seu gosto. Avalie alguns títulos para melhorar as recomendações.';
}

// ---------- Estatísticas para a página "Meu gosto" ----------

function calcularEstatisticas({ historico, titulos }) {
  const vistos = new Map();
  for (const h of historico) {
    if (h.tmdb_id) vistos.set(`${h.tipo}:${h.tmdb_id}`, { tipo: h.tipo, genre_ids: h.generos || [], idioma: h.idioma_original, ano: h.ano });
  }
  for (const t of titulos) {
    if (t.status === 'ja_vi' && t.dados) {
      vistos.set(`${t.tipo}:${t.tmdb_id}`, {
        tipo: t.tipo,
        genre_ids: t.dados.genre_ids || [],
        idioma: t.dados.idioma_original,
        ano: t.dados.ano,
      });
    }
  }

  const generos = {};
  const idiomas = {};
  const decadas = {};
  for (const v of vistos.values()) {
    for (const k of chavesDoTitulo(v.tipo, v.genre_ids)) generos[k] = (generos[k] || 0) + 1;
    if (v.idioma) idiomas[v.idioma] = (idiomas[v.idioma] || 0) + 1;
    const ano = parseInt(v.ano, 10);
    if (ano) {
      const d = `${Math.floor(ano / 10) * 10}s`;
      decadas[d] = (decadas[d] || 0) + 1;
    }
  }
  const lista = (obj, nome, limite = 8) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limite)
      .map(([k, valor]) => ({ chave: k, nome: nome(k), valor }));

  return {
    generos: lista(generos, nomeGenero),
    idiomas: lista(idiomas, nomeIdioma, 6),
    decadas: Object.entries(decadas).sort((a, b) => a[0].localeCompare(b[0])).map(([k, valor]) => ({ chave: k, nome: k, valor })),
    total_vistos: vistos.size,
    total_avaliados: titulos.filter((t) => t.nota).length,
  };
}

// ---------- Mineração de dados (MovieLens) para a página "Meu gosto" ----------

/**
 * Para os filmes favoritos: as regras de associação mais fortes
 * ("quem amou A também amou B") e as famílias de gosto (clusters do k-means).
 */
async function resumoMineracao(filmes) {
  if (!movielens.disponivel() || !filmes.length) return null;

  const pares = [];
  for (const f of filmes.slice(0, 5)) {
    for (const r of movielens.regras(f.tmdb_id, 3)) {
      if (filmes.some((x) => x.tmdb_id === r.tmdb_id)) continue; // já é favorito: não ensina nada
      if (pares.some((p) => p.r.tmdb_id === r.tmdb_id)) continue;
      pares.push({ f, r });
    }
  }
  const escolhidos = pares.sort((a, b) => b.r.confianca * b.r.lift - a.r.confianca * a.r.lift).slice(0, 8);

  // Títulos e pôsteres em português (o TMDB tem cache; o título do MovieLens fica de reserva)
  const ids = [...new Set(escolhidos.flatMap(({ f, r }) => [f.tmdb_id, r.tmdb_id]))];
  const detalhes = new Map(
    (await mapLimit(ids, 4, (id) => getTitle('movie', id).catch(() => null))).map((t, i) => [ids[i], t])
  );
  const filme = (id, reserva) => ({
    tmdb_id: id,
    titulo: detalhes.get(id)?.titulo || reserva || '',
    poster_path: detalhes.get(id)?.poster_path || null,
  });
  const regras = escolhidos.map(({ f, r }) => ({
    de: filme(f.tmdb_id, f.titulo),
    para: filme(r.tmdb_id, r.titulo),
    confianca: Math.round(r.confianca * 100) / 100,
    lift: Math.round(r.lift * 10) / 10,
  }));

  const contagem = new Map();
  for (const f of filmes) {
    const c = movielens.familia(f.tmdb_id);
    if (!c) continue;
    const atual = contagem.get(c.id) || { nome: c.nome, quantidade: 0, exemplos: c.exemplos.map((e) => e.titulo), seus: [] };
    atual.quantidade++;
    if (atual.seus.length < 3) atual.seus.push(detalhes.get(f.tmdb_id)?.titulo || f.titulo);
    contagem.set(c.id, atual);
  }
  const familias = [...contagem.values()].sort((a, b) => b.quantidade - a.quantidade).slice(0, 6);

  return regras.length || familias.length ? { regras, familias } : null;
}

// ---------- Passo 2: refinamento pela IA ----------

function mesclarComIA(base, ia, ancorasPossiveis) {
  if (!ia || typeof ia !== 'object') return null;
  const clamp = (n) => Math.max(0, Math.min(1, Number(n) || 0));
  const valida = (k) => CHAVES_GENERO.includes(k);

  const favoritos = (Array.isArray(ia.generos_favoritos) ? ia.generos_favoritos : [])
    .filter((g) => valida(g?.chave))
    .slice(0, 6)
    .map((g) => ({ chave: g.chave, nome: nomeGenero(g.chave), peso: clamp(g.peso) }));

  const evitar = (Array.isArray(ia.generos_evitar) ? ia.generos_evitar : [])
    .filter((g) => valida(g?.chave) && !favoritos.some((f) => f.chave === g.chave))
    .slice(0, 5)
    .map((g) => ({
      chave: g.chave,
      nome: nomeGenero(g.chave),
      forca: clamp(g.forca ?? 0.7),
      nuance: typeof g.nuance === 'string' && g.nuance.trim() ? g.nuance.trim() : null,
    }));

  const textos = (arr, max) =>
    (Array.isArray(arr) ? arr : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, max);

  const mapaAncoras = new Map(ancorasPossiveis.map((a) => [a.id, a]));
  const ancoras = textos(ia.titulos_ancora, 6)
    .map((id) => mapaAncoras.get(id))
    .filter(Boolean)
    .map(({ id, ...resto }) => resto);

  return {
    resumo: typeof ia.resumo === 'string' && ia.resumo.trim() ? ia.resumo.trim() : base.resumo,
    generos_favoritos: favoritos.length ? favoritos : base.generos_favoritos,
    generos_evitar: evitar,
    palavras_chave: textos(ia.palavras_chave_tmdb, 8).map((termo) => ({ termo, id: null })),
    idiomas_preferidos: textos(ia.idiomas_preferidos, 8).filter((l) => IDIOMAS[l]),
    tom: textos(ia.tom, 10),
    evitar: textos(ia.evitar, 10),
    titulos_ancora: ancoras.length ? ancoras : base.titulos_ancora,
    duracao_preferida: FORMATOS.includes(ia.duracao_preferida) ? ia.duracao_preferida : base.duracao_preferida,
  };
}

// Prepara os dados do usuário em formato compacto para a IA
function entradaParaIA(dados, base, ancorasPossiveis) {
  const quiz = dados.quiz
    .map((r) => {
      const q = perguntaPorId(r.question_id);
      if (!q) return null;
      const respostas =
        q.tipo === 'titulos'
          ? (r.option_ids || []).map((id) => ancorasPossiveis.find((a) => a.id === id)?.titulo || id)
          : (r.option_ids || []).map((id) => q.opcoes.find((o) => o.id === id)?.texto).filter(Boolean);
      return { pergunta: q.pergunta, respostas, comentario: r.comentario || undefined };
    })
    .filter(Boolean);

  const historico = dados.historico
    .filter((h) => h.tmdb_id)
    .slice(0, 40)
    .map((h) => ({
      titulo: h.titulo_tmdb || h.titulo_original,
      tipo: h.tipo === 'tv' ? 'série' : 'filme',
      generos: chavesDoTitulo(h.tipo, h.generos || []),
      idioma: h.idioma_original,
      episodios: h.tipo === 'tv' ? h.episodios_vistos : undefined,
      peso: h.peso,
    }));

  const avaliacoes = dados.titulos
    .filter((t) => t.origem !== 'historico' || t.nota)
    .filter((t) => t.nota || t.status === 'nao_interessa')
    .slice(0, 40)
    .map((t) => ({
      titulo: t.dados?.titulo,
      generos: chavesDoTitulo(t.tipo, t.dados?.genre_ids || []),
      nota: t.nota || undefined,
      nao_interessa: t.status === 'nao_interessa' || undefined,
      motivo: t.motivo || undefined,
    }));

  return {
    quiz,
    historico,
    avaliacoes,
    perfilBase: {
      ...base,
      titulos_ancora: base.titulos_ancora.map((a) => `${a.tipo}:${a.tmdb_id}`),
    },
    ancorasPossiveis: ancorasPossiveis.map((a) => ({ id: a.id, titulo: a.titulo })),
  };
}

// ---------- Orquestração ----------

export async function gerarPerfil(db, userId) {
  // Tira do banco as linhas sem nome que tenham ficado de importações antigas
  await limparHistorico(db).catch((e) => console.warn('[perfil] limpeza do histórico:', e.message));
  const dados = await carregarDadosUsuario(db);
  const anterior = await carregarPerfil(db).catch(() => null);
  const final = await construirPerfilDeDados(dados, { anterior: anterior?.perfil });

  const { error } = await db
    .from('taste_profiles')
    .upsert({ user_id: userId, perfil: final, fonte: final.fonte, atualizado_em: final.gerado_em });
  if (error) throw error;

  // Perfil novo = recomendações antigas não valem mais
  await db.from('recommendation_cache').delete().eq('user_id', userId);

  // Prepara o componente de séries em segundo plano (catálogo, fichas e Trakt das séries desta pessoa):
  // quem acabou de importar o histórico recebe as recomendações sem esperar tudo isso na primeira vez
  prepararSeries(montarBaseSeries(dados)).catch((e) => console.warn('[series] preparação em segundo plano:', e.message));

  return final;
}

/**
 * Monta o perfil a partir dos dados (quiz, histórico, títulos) SEM ler nem gravar no banco.
 * Usado pela geração normal e pela avaliação com os dados da pessoa (scripts/avaliacao/), que
 * esconde parte dos títulos e refaz o perfil sem eles.
 * opcoes.usarIA: false para uma versão determinística; opcoes.anterior: perfil anterior (guarda os temas bloqueados).
 */
export async function construirPerfilDeDados(dados, { usarIA = true, anterior = null } = {}) {
  const temQuiz = dados.quiz.some((r) => r.option_ids?.length || r.comentario);
  const temHistorico = dados.historico.some((h) => h.tmdb_id);

  // Títulos citados na pergunta 10 do quiz (ex.: "tv:70523")
  const refsQuiz = (dados.quiz.find((r) => r.question_id === 10)?.option_ids || [])
    .map((s) => s.split(':'))
    .filter(([tipo, id]) => (tipo === 'movie' || tipo === 'tv') && Number(id));
  const detalhesQuiz = await mapLimit(refsQuiz, 3, ([tipo, id]) => getTitle(tipo, Number(id)));
  const ancorasQuiz = detalhesQuiz.filter(Boolean).map((t) => ({
    tmdb_id: t.tmdb_id,
    tipo: t.tipo,
    titulo: t.titulo,
    poster_path: t.poster_path,
  }));

  const { perfil: base } = construirPerfilBase(dados, ancorasQuiz);

  // Assinatura de gosto: temas, diretores, elenco... dos favoritos (e dos rejeitados)
  const { assinatura, favoritos, rejeitados } = await construirAssinatura(dados, ancorasQuiz);
  const assinaturaResumo = resumoAssinatura(assinatura);

  // Lista de títulos que a IA pode escolher como âncora (ela não pode inventar outros)
  const possiveis = new Map();
  const addPossivel = (a) => a.tmdb_id && possiveis.set(`${a.tipo}:${a.tmdb_id}`, { id: `${a.tipo}:${a.tmdb_id}`, ...a });
  ancorasQuiz.forEach(addPossivel);
  dados.titulos
    .filter((t) => t.status === 'ja_vi' && t.nota >= 4)
    .forEach((t) => addPossivel({ tmdb_id: t.tmdb_id, tipo: t.tipo, titulo: t.dados?.titulo || '', poster_path: t.dados?.poster_path || null }));
  dados.historico
    .filter((h) => h.tmdb_id && h.peso >= 0.5)
    .slice(0, 12)
    .forEach((h) => addPossivel({ tmdb_id: h.tmdb_id, tipo: h.tipo, titulo: h.titulo_tmdb || h.titulo_original, poster_path: h.poster_path }));
  favoritos.forEach(addPossivel);
  const ancorasPossiveis = [...possiveis.values()];

  let perfil = base;
  let geradoPor = 'regras';
  if (usarIA && iaDisponivel()) {
    const entrada = entradaParaIA(dados, base, ancorasPossiveis);
    if (assinaturaResumo) {
      entrada.detalhes_dos_favoritos = {
        temas_que_mais_se_repetem: assinaturaResumo.temas.map((t) => t.texto),
        diretores_criadores: assinaturaResumo.pessoas.map((p) => p.texto),
        atores: assinaturaResumo.elenco.map((p) => p.texto),
        temas_dos_rejeitados: assinaturaResumo.temas_evitados,
      };
    }
    const ia = await iaGerarPerfil(entrada);
    const mesclado = mesclarComIA(base, ia, ancorasPossiveis);
    if (mesclado) {
      perfil = mesclado;
      geradoPor = 'ia';
    }
  }

  // Palavras-chave em texto -> IDs do TMDB (as que não existirem são descartadas)
  const ids = await mapLimit(perfil.palavras_chave, 4, (p) => keywordId(p.termo));
  perfil.palavras_chave = perfil.palavras_chave
    .map((p, i) => ({ ...p, id: ids[i] ?? null }))
    .filter((p) => p.id);

  // Mineração (Meu gosto): os filmes de maior peso da base inteira do MovieLens (todos os filmes da pessoa na base)
  const baseMl = montarBase(dados);
  const filmesFav = baseMl.itens.filter((x) => x.w > 0).map((x) => ({ tmdb_id: x.tmdb_id, tipo: 'movie', titulo: x.titulo }));
  const mineracao = await resumoMineracao(filmesFav).catch((e) => {
    console.warn('[perfil] mineração indisponível:', e.message);
    return null;
  });

  const fonte = temHistorico && temQuiz ? 'combinado' : temHistorico ? 'historico' : 'quiz';
  const final = {
    ...perfil,
    assinatura,
    assinatura_resumo: assinaturaResumo,
    sementes: favoritos.map(({ peso, ...s }) => s),
    rejeitados: rejeitados.map(({ peso, ...r }) => r),
    fonte,
    gerado_por: geradoPor,
    estatisticas: calcularEstatisticas(dados),
    mineracao,
    movielens_base: { disponiveis: baseMl.disponiveis, minimo: baseMl.minimo, alfa: baseMl.alfa, aviso: baseMl.aviso },
    // Escolha da pessoa: continua valendo quando o perfil é recalculado
    temas_bloqueados: anterior?.temas_bloqueados || null,
    gerado_em: new Date().toISOString(),
  };
  return final;
}

// Quantas avaliações novas desde a última geração do perfil (para a atualização automática)
export async function avaliacoesDesde(db, desde) {
  const { count, error } = await db
    .from('user_titles')
    .select('tmdb_id', { count: 'exact', head: true })
    .gt('atualizado_em', desde)
    .or('status.eq.nao_interessa,and(status.eq.ja_vi,nota.not.is.null)');
  if (error) throw error;
  return count || 0;
}

