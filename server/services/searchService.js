// Pesquisa com filtros (aba "Pesquisar") + texto livre interpretado pela IA.
// Os resultados passam pela MESMA verificação da Netflix BR e excluem já vistos/descartados.

import { CHAVES_GENERO, chavesDoTitulo } from '../lib/genres.js';
import { IDIOMAS } from '../lib/languages.js';
import { mapLimit } from '../lib/limit.js';
import { iaInterpretarBusca } from './aiService.js';
import { cached, DIA } from './cache.js';
import { chaveTitulo, classificacaoNumero, descobrirVerificados, verificarVarios } from './netflixCheck.js';
import { carregarPerfil } from './profileService.js';
import { carregarBase } from './movielensBase.js';
import { anexarNotas, carregarExcluidos, paraCard, ranquear } from './recommendationService.js';
import { aplicarHumor } from './scoring.js';
import { keywordId, recommendations, searchMulti } from './tmdbService.js';

const ORDENS = ['combina', 'nota', 'recentes', 'popularidade'];
const CLIMAS = ['leve', 'intenso', 'pensar', 'rir', 'chorar'];
const CLASSIFICACOES = ['L', '10', '12', '14', '16', '18'];

const numOuNull = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const listaValida = (arr, validos) => (Array.isArray(arr) ? arr.filter((x) => validos.includes(x)) : []);

// Limpa e valida o que veio do formulário
export function normalizarFiltros(f = {}) {
  return {
    tipo: ['movie', 'tv', 'ambos'].includes(f.tipo) ? f.tipo : 'ambos',
    generos: listaValida(f.generos, CHAVES_GENERO),
    excluirGeneros: listaValida(f.excluirGeneros, CHAVES_GENERO),
    duracaoMin: numOuNull(f.duracaoMin),
    duracaoMax: numOuNull(f.duracaoMax),
    temporadas: ['mini', 'ate3'].includes(f.temporadas) ? f.temporadas : 'qualquer',
    anoMin: numOuNull(f.anoMin),
    anoMax: numOuNull(f.anoMax),
    notaMin: numOuNull(f.notaMin),
    votosMin: numOuNull(f.votosMin),
    idiomas: listaValida(f.idiomas, Object.keys(IDIOMAS)),
    classificacaoMax: CLASSIFICACOES.includes(f.classificacaoMax) ? f.classificacaoMax : null,
    clima: CLIMAS.includes(f.clima) ? f.clima : null,
    joias: !!f.joias,
    ordenar: ORDENS.includes(f.ordenar) ? f.ordenar : 'combina',
  };
}

// Plano B sem IA: entende pedidos comuns por palavras
export function interpretarPorRegras(texto) {
  const t = texto.toLowerCase();
  const tem = (re) => re.test(t);
  const r = { tipo: null, generos: [], excluir_generos: [], palavras_chave_tmdb: [], titulos_referencia: [], idiomas: [], clima: null };

  const mapa = [
    [/com[eé]dia|engra[cç]ad|rir\b|divertid/, 'comedia'],
    [/terror|horror|assustador/, 'terror'],
    [/suspense|thriller|tens[aã]o/, 'thriller'],
    [/romance|rom[aâ]ntic|amor\b/, 'romance'],
    [/a[cç][aã]o\b|porrada|explos/, 'acao'],
    [/fic[cç][aã]o cient|sci-?fi|espacial|futur/, 'scifi'],
    [/fantasia|magia|drag[aã]o/, 'fantasia'],
    [/document[aá]ri|hist[oó]ria real|fatos reais/, 'documentario'],
    [/drama|chorar|emocionante/, 'drama'],
    [/anima[cç][aã]o|animad|anime|desenho/, 'animacao'],
    [/crime|policial|m[aá]fia|detetive/, 'crime'],
    [/mist[eé]rio|investiga/, 'misterio'],
    [/fam[ií]lia|crian[cç]a|m[aã]e|pai\b|av[oóô]/, 'familia'],
    [/guerra/, 'guerra'],
  ];
  for (const [re, chave] of mapa) if (tem(re)) r.generos.push(chave);
  if (tem(/sem terror|nada de terror|n[aã]o.*terror/)) {
    r.generos = r.generos.filter((g) => g !== 'terror');
    r.excluir_generos.push('terror');
  }
  if (tem(/m[aã]e|fam[ií]lia|crian[cç]a/)) r.excluir_generos.push('terror');

  if (tem(/\bs[eé]ries?\b|maratona/)) r.tipo = 'tv';
  else if (tem(/\bfilmes?\b/)) r.tipo = 'movie';

  const idiomas = { coreano: 'ko', coreia: 'ko', japon: 'ja', anime: 'ja', espanhol: 'es', franc: 'fr', alem: 'de', brasileir: 'pt', nacional: 'pt', italian: 'it' };
  for (const [termo, cod] of Object.entries(idiomas)) if (t.includes(termo)) r.idiomas.push(cod);

  if (tem(/leve|tranquil|relax/)) r.clima = 'leve';
  else if (tem(/pensar|cabe[cç]a|reflex/)) r.clima = 'pensar';
  else if (tem(/chorar/)) r.clima = 'chorar';
  else if (tem(/rir\b|engra[cç]ad/)) r.clima = 'rir';
  else if (tem(/intens|adrenalina/)) r.clima = 'intenso';

  if (tem(/curt[oa]|r[aá]pid|menos de (1|uma) ?h/)) r.duracao_max_min = 100;

  // "tipo Dark", "parecido com Dark", "estilo Black Mirror"
  const ref = texto.match(/(?:tipo|parecid[oa] com|igual a|estilo|no estilo de|como)\s+["“]?([^,.;"”]+?)["”]?(?:,|\.|;| mas | s[oó] | por[eé]m |$)/i);
  if (ref) r.titulos_referencia.push(ref[1].trim());

  r.generos = [...new Set(r.generos)];
  r.explicacao = 'Entendemos seu pedido por palavras-chave (sem IA).';
  return r;
}

async function interpretar(texto, perfil) {
  const chave = `busca:${texto.trim().toLowerCase()}`;
  const ia = await cached(chave, 7 * DIA, async () => (await iaInterpretarBusca({ texto, perfil })) ?? undefined);
  return ia ? { ...ia, por: 'ia' } : { ...interpretarPorRegras(texto), por: 'regras' };
}

// Mescla o que a IA entendeu nos filtros (os filtros explícitos do usuário têm prioridade)
function aplicarInterpretacao(f, i) {
  const g = (arr) => listaValida(arr, CHAVES_GENERO);
  const tipo = f.tipo === 'ambos' && ['movie', 'tv'].includes(i.tipo) ? i.tipo : f.tipo;
  return {
    ...f,
    tipo,
    generosTexto: g(i.generos).filter((x) => !f.generos.includes(x)),
    excluirGeneros: [...new Set([...f.excluirGeneros, ...g(i.excluir_generos)])],
    idiomas: f.idiomas.length ? f.idiomas : listaValida(i.idiomas, Object.keys(IDIOMAS)),
    anoMin: f.anoMin ?? numOuNull(i.ano_min),
    anoMax: f.anoMax ?? numOuNull(i.ano_max),
    duracaoMax: f.duracaoMax ?? numOuNull(i.duracao_max_min),
    clima: f.clima ?? (CLIMAS.includes(i.clima) ? i.clima : null),
  };
}

export async function buscar(db, userId, { filtros, texto }) {
  let f = normalizarFiltros(filtros);
  const linhaPerfil = await carregarPerfil(db).catch(() => null);
  // A base do MovieLens (todos os filmes da pessoa que a mineração conhece) vale também na pesquisa
  const perfil = linhaPerfil ? { ...linhaPerfil.perfil, base_movielens: await carregarBase(db).catch(() => null) } : null;
  const { excluir, status } = await carregarExcluidos(db);

  // ---- Texto livre ----
  let interpretacao = null;
  let kwTexto = [];
  const parecidos = new Map();
  let refsCandidatas = [];
  const textoLimpo = (texto || '').trim().slice(0, 300);
  if (textoLimpo) {
    interpretacao = await interpretar(textoLimpo, perfil);
    f = aplicarInterpretacao(f, interpretacao);

    const termos = (interpretacao.palavras_chave_tmdb || []).filter((x) => typeof x === 'string').slice(0, 5);
    kwTexto = (await mapLimit(termos, 4, (t) => keywordId(t))).filter(Boolean);

    // Títulos de referência ("tipo Dark") -> recomendações do TMDB a partir deles
    const nomes = (interpretacao.titulos_referencia || []).filter((x) => typeof x === 'string').slice(0, 2);
    for (const nome of nomes) {
      const achado = (await searchMulti(nome))[0];
      if (!achado) continue;
      const recs = await recommendations(achado.media_type, achado.id);
      for (const r of recs.slice(0, 15)) {
        const k = chaveTitulo(r.media_type, r.id);
        if (excluir.has(k) || parecidos.has(k)) continue;
        parecidos.set(k, achado.title || achado.name);
        refsCandidatas.push({ tipo: r.media_type, id: r.id });
      }
    }
  }

  // ---- Filtros que o /discover não sabe aplicar (verificados título a título) ----
  const filtroExtra = (t) => {
    if (excluir.has(chaveTitulo(t.tipo, t.tmdb_id))) return false;
    if (f.tipo !== 'ambos' && t.tipo !== f.tipo) return false;
    if (t.tipo === 'tv') {
      if (f.temporadas === 'mini' && (t.temporadas ?? 1) > 1) return false;
      if (f.temporadas === 'ate3' && (t.temporadas ?? 1) > 3) return false;
    }
    if (f.classificacaoMax) {
      const c = classificacaoNumero(t.classificacao);
      if (c !== null && c > classificacaoNumero(f.classificacaoMax)) return false;
    }
    return true;
  };
  // Filtros completos para candidatos que NÃO vieram do /discover (referências do texto)
  const filtroCompleto = (t) => {
    if (!filtroExtra(t)) return false;
    const ano = parseInt(t.ano, 10);
    if (f.anoMin && ano && ano < f.anoMin) return false;
    if (f.anoMax && ano && ano > f.anoMax) return false;
    if (f.notaMin && (t.nota_tmdb || 0) < f.notaMin) return false;
    if (t.tipo === 'movie' && t.duracao) {
      if (f.duracaoMin && t.duracao < f.duracaoMin) return false;
      if (f.duracaoMax && t.duracao > f.duracaoMax) return false;
    }
    const chaves = chavesDoTitulo(t.tipo, t.genre_ids || []);
    if (f.excluirGeneros.some((g) => chaves.includes(g))) return false;
    // Gêneros escolhidos explicitamente no formulário: precisa ter pelo menos um
    if (f.generos.length && !f.generos.some((g) => chaves.includes(g))) return false;
    return true;
  };

  const tipos = f.tipo === 'ambos' ? ['movie', 'tv'] : [f.tipo];
  const montarConsulta = (tipo, { usarTexto = true } = {}) => ({
    tipo,
    generos: usarTexto ? [...f.generos, ...(f.generosTexto || [])] : f.generos,
    excluirGeneros: f.excluirGeneros,
    palavrasChave: usarTexto ? kwTexto : [],
    idiomas: f.idiomas,
    anoMin: f.anoMin,
    anoMax: f.anoMax,
    duracaoMin: f.duracaoMin,
    duracaoMax: f.duracaoMax,
    notaMin: f.joias ? Math.max(f.notaMin || 0, 7.2) : f.notaMin,
    votosMin: f.joias ? Math.max(f.votosMin || 0, 50) : f.votosMin ?? 50,
    votosMax: f.joias ? 1500 : undefined,
    classificacaoMax: f.classificacaoMax,
    ordenar: f.joias ? 'nota' : f.ordenar === 'combina' ? 'popularidade' : f.ordenar,
  });

  const alvo = tipos.length > 1 ? 12 : 20;
  const [deReferencias, ...porTipo] = await Promise.all([
    verificarVarios(refsCandidatas, filtroCompleto),
    ...tipos.map((tipo) => descobrirVerificados(montarConsulta(tipo), { alvo, maxPaginas: 5, excluir, filtroExtra })),
  ]);

  const unicos = new Map();
  for (const t of [...deReferencias, ...porTipo.flat()]) unicos.set(chaveTitulo(t.tipo, t.tmdb_id), t);

  // Pouca coisa? Se o texto trouxe palavras-chave/gêneros extras, afrouxa só eles
  let aviso = null;
  if (unicos.size < 10 && textoLimpo && (kwTexto.length || f.generosTexto?.length)) {
    const mais = await Promise.all(
      tipos.map((tipo) => descobrirVerificados(montarConsulta(tipo, { usarTexto: false }), { alvo, maxPaginas: 5, excluir, filtroExtra }))
    );
    for (const t of mais.flat()) unicos.set(chaveTitulo(t.tipo, t.tmdb_id), t);
    aviso = 'Ampliamos um pouco a busca para encontrar mais opções.';
  }

  // ---- Ordenação ----
  let itens = [...unicos.values()];
  if (f.ordenar === 'combina') {
    const sinais = new Map([...parecidos].map(([k, nome]) => [k, { parecidoCom: nome, sementes: 1, nomesSementes: [nome] }]));
    itens = await ranquear(itens, perfil, { sinais, contexto: textoLimpo });
    if (f.clima) itens = aplicarHumor(itens, { clima: f.clima }, 0).itens;
  } else {
    const ordem = {
      nota: (a, b) => (b.nota_tmdb || 0) - (a.nota_tmdb || 0),
      recentes: (a, b) => (b.data_lancamento || '').localeCompare(a.data_lancamento || ''),
      popularidade: (a, b) => (b.popularidade || 0) - (a.popularidade || 0),
    }[f.ordenar];
    itens = itens.sort(ordem).map((t) => ({ ...paraCard(t), motivo: null, motivo_por: null }));
    if (f.clima) itens = aplicarHumor(itens, { clima: f.clima }, 0).itens;
  }

  const finais = await anexarNotas(itens.slice(0, 30));

  // Salva os últimos filtros usados no perfil do usuário
  db.from('profiles')
    .update({ ultimo_filtro: { filtros: normalizarFiltros(filtros), texto: textoLimpo } })
    .eq('id', userId)
    .then(({ error }) => error && console.warn('[profiles.ultimo_filtro]', error.message));

  return {
    itens: finais.map((t) => ({ ...t, status_usuario: status.get(chaveTitulo(t.tipo, t.tmdb_id)) || null })),
    interpretacao: interpretacao ? { explicacao: interpretacao.explicacao || null, por: interpretacao.por } : null,
    aviso: finais.length ? aviso : 'Nenhum resultado com esses filtros. Tente afrouxar a duração, o ano ou a nota mínima.',
  };
}
