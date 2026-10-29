// "Assinatura de gosto": o retrato detalhado do que a pessoa curte, além do gênero.
//
// Gênero é amplo demais ("drama" vale para quase tudo). A assinatura olha para os detalhes
// dos títulos que a pessoa AMOU (pontos a favor) e REJEITOU (pontos contra):
//   - temas (palavras-chave do TMDB: "time travel", "small town", "nonlinear timeline"...)
//   - diretores/criadores e atores principais
//   - idioma original e década
// Depois, cada candidato é comparado com a assinatura (similaridade de cosseno):
// quanto mais detalhes em comum com os favoritos, maior a nota.

import { chavesDoTitulo, nomeGenero } from '../lib/genres.js';
import { nomeIdioma } from '../lib/languages.js';
import { mapLimit } from '../lib/limit.js';
import { iaDisponivel, iaTraduzirTermos } from './aiService.js';
import { getTitle } from './tmdbService.js';

export const VERSAO_ASSINATURA = 1;
const MAX_AMOSTRAS = 60;

// Palavras-chave genéricas demais, que não dizem nada sobre o gosto
const GENERICAS = new Set([
  'woman director', 'duringcreditsstinger', 'aftercreditsstinger', 'based on novel or book', 'based on comic',
  'based on manga', 'sequel', 'prequel', 'remake', 'live action remake', 'anime', '3d', 'miniseries', 'short film',
  'netflix', 'streaming', 'tv movie', 'adult animation', 'soft reboot', 'reboot', 'spin off', 'aftercredits stinger',
  'female protagonist', 'male protagonist', 'friendship', 'love', 'family', 'murder', 'death', 'relationship',
]);

// Quanto cada tipo de detalhe pesa na comparação
const PESOS = { kw: 1, diretor: 1.2, ator: 0.45, genero: 0.6, idioma: 0.7, decada: 0.3 };

/**
 * Extrai os "detalhes" de um título normalizado (vindo de getTitle).
 * Devolve Map(chaveDoDetalhe -> { peso, rotulo, tipo }).
 */
export function detalhesDoTitulo(t) {
  const f = new Map();
  for (const k of t.palavras_chave || []) {
    if (!k?.id || GENERICAS.has(String(k.nome).toLowerCase())) continue;
    f.set(`kw:${k.id}`, { peso: PESOS.kw, rotulo: k.nome, tipo: 'tema' });
  }
  for (const d of (t.diretores || []).slice(0, 2)) f.set(`p:${d}`, { peso: PESOS.diretor, rotulo: d, tipo: t.tipo === 'tv' ? 'criacao' : 'direcao' });
  for (const a of (t.elenco || []).slice(0, 3)) if (a?.nome) f.set(`p:${a.nome}`, { peso: PESOS.ator, rotulo: a.nome, tipo: 'elenco' });
  for (const g of chavesDoTitulo(t.tipo, t.genre_ids || [])) f.set(`g:${g}`, { peso: PESOS.genero, rotulo: nomeGenero(g), tipo: 'genero' });
  if (t.idioma_original) f.set(`l:${t.idioma_original}`, { peso: PESOS.idioma, rotulo: nomeIdioma(t.idioma_original), tipo: 'idioma' });
  const ano = parseInt(t.ano, 10);
  if (ano) f.set(`d:${Math.floor(ano / 10) * 10}`, { peso: PESOS.decada, rotulo: `anos ${String(Math.floor(ano / 10) * 10).slice(2)}`, tipo: 'decada' });
  return f;
}

// Quanto cada título conhecido diz sobre o gosto: +1 (amou) a -1 (rejeitou)
function amostrasDoUsuario({ historico, titulos }, ancorasQuiz) {
  const mapa = new Map();
  const definir = (tipo, id, peso, prioridade) => {
    if (!tipo || !id) return;
    const k = `${tipo}:${id}`;
    const atual = mapa.get(k);
    // Fonte mais confiável vence: quiz (3) > nota dada no app (2) > histórico (1)
    if (!atual || prioridade > atual.prioridade) mapa.set(k, { tipo, id, peso, prioridade });
  };

  for (const h of historico) if (h.tmdb_id && h.peso) definir(h.tipo, h.tmdb_id, h.peso * 0.8, 1);
  for (const t of titulos) {
    if (t.status === 'ja_vi' && t.nota) definir(t.tipo, t.tmdb_id, (t.nota - 3) / 2, 2); // 5 -> +1, 1 -> -1
    if (t.status === 'nao_interessa') definir(t.tipo, t.tmdb_id, -0.6, 2);
  }
  for (const a of ancorasQuiz) definir(a.tipo, a.tmdb_id, 1.5, 3);

  return [...mapa.values()]
    .filter((a) => Math.abs(a.peso) >= 0.2)
    .sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso))
    .slice(0, MAX_AMOSTRAS);
}

/**
 * Constrói a assinatura a partir dos dados do usuário.
 * Devolve {
 *   assinatura: { versao, vetor: {detalhe: peso}, rotulos: {detalhe: {texto, tipo}}, norma, amostras } | null,
 *   favoritos:  [{ tmdb_id, tipo, titulo, poster_path, peso }]  (viram "sementes" das recomendações)
 *   rejeitados: [{ tmdb_id, tipo, titulo }]
 * }
 */
export async function construirAssinatura(dados, ancorasQuiz = []) {
  const amostras = amostrasDoUsuario(dados, ancorasQuiz);
  const vazio = { assinatura: null, favoritos: [], rejeitados: [] };
  if (!amostras.length) return vazio;

  const detalhes = await mapLimit(amostras, 6, (a) => getTitle(a.tipo, a.id));
  const resumoTitulo = (t, a) => ({ tmdb_id: t.tmdb_id, tipo: t.tipo, titulo: t.titulo, poster_path: t.poster_path, peso: Math.round(a.peso * 100) / 100 });
  const favoritos = detalhes
    .map((t, i) => t && amostras[i].peso >= 0.4 && resumoTitulo(t, amostras[i]))
    .filter(Boolean)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 12);
  const rejeitados = detalhes
    .map((t, i) => t && amostras[i].peso <= -0.4 && resumoTitulo(t, amostras[i]))
    .filter(Boolean)
    .slice(0, 8);
  const soma = new Map();
  const rotulos = {};
  let usadas = 0;

  detalhes.forEach((t, i) => {
    if (!t) return;
    usadas++;
    for (const [k, d] of detalhesDoTitulo(t)) {
      soma.set(k, (soma.get(k) || 0) + amostras[i].peso * d.peso);
      rotulos[k] ||= { texto: d.rotulo, tipo: d.tipo };
    }
  });
  if (!usadas) return vazio;

  // Normaliza pelo número de amostras e mantém só os detalhes mais marcantes
  const fator = 1 / Math.sqrt(usadas);
  const ordenados = [...soma.entries()]
    .map(([k, v]) => [k, Math.round(v * fator * 1000) / 1000])
    .filter(([, v]) => Math.abs(v) >= 0.05);
  const positivos = ordenados.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 160);
  const negativos = ordenados.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 60);
  const vetor = Object.fromEntries([...positivos, ...negativos]);
  const rotulosUsados = Object.fromEntries(Object.keys(vetor).map((k) => [k, rotulos[k]]));

  // Traduz os temas mais fortes para português (as palavras-chave do TMDB vêm em inglês)
  if (iaDisponivel()) {
    const temas = positivos.filter(([k]) => k.startsWith('kw:')).slice(0, 40).map(([k]) => rotulosUsados[k].texto);
    const traducoes = await iaTraduzirTermos(temas);
    if (traducoes) {
      for (const k of Object.keys(rotulosUsados)) {
        const pt = traducoes[rotulosUsados[k].texto];
        if (k.startsWith('kw:') && pt) rotulosUsados[k] = { ...rotulosUsados[k], texto: pt };
      }
    }
  }

  const norma = Math.sqrt(Object.values(vetor).reduce((s, v) => s + v * v, 0)) || 1;
  return {
    assinatura: { versao: VERSAO_ASSINATURA, vetor, rotulos: rotulosUsados, norma, amostras: usadas },
    favoritos,
    rejeitados,
  };
}

/**
 * Compara um título com a assinatura.
 * Devolve { cos: -1..1, destaques: [{texto, tipo}] (o que ele tem em comum com os favoritos) }
 */
export function similaridade(t, assinatura) {
  if (!assinatura?.vetor) return { cos: 0, destaques: [], alertas: [] };
  const f = detalhesDoTitulo(t);
  let produto = 0;
  let normaT = 0;
  const contribuicoes = [];
  for (const [k, d] of f) {
    normaT += d.peso * d.peso;
    const s = assinatura.vetor[k];
    if (s) {
      produto += s * d.peso;
      contribuicoes.push([k, s * d.peso]);
    }
  }
  if (!normaT) return { cos: 0, destaques: [], alertas: [] };
  const cos = produto / (Math.sqrt(normaT) * assinatura.norma);

  const rotulo = (k) => assinatura.rotulos?.[k] || { texto: k, tipo: 'tema' };
  const relevantes = (lista) => lista.filter(([k]) => k.startsWith('kw:') || k.startsWith('p:')).map(([k]) => rotulo(k));
  const destaques = relevantes(contribuicoes.filter(([, v]) => v > 0.04).sort((a, b) => b[1] - a[1])).slice(0, 3);
  const alertas = relevantes(contribuicoes.filter(([, v]) => v < -0.04).sort((a, b) => a[1] - b[1])).slice(0, 2);
  return { cos: Math.round(cos * 1000) / 1000, destaques, alertas };
}

// Resumo legível para a página "Meu gosto": temas e pessoas mais marcantes
export function resumoAssinatura(assinatura) {
  if (!assinatura?.vetor) return null;
  const top = (prefixo, filtro, n) =>
    Object.entries(assinatura.vetor)
      .filter(([k, v]) => k.startsWith(prefixo) && v > 0 && (!filtro || filtro(assinatura.rotulos[k])))
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => ({ texto: assinatura.rotulos[k]?.texto || k, valor: v }));
  return {
    temas: top('kw:', null, 12),
    pessoas: top('p:', (r) => r?.tipo !== 'elenco', 6),
    elenco: top('p:', (r) => r?.tipo === 'elenco', 6),
    temas_evitados: Object.entries(assinatura.vetor)
      .filter(([k, v]) => k.startsWith('kw:') && v < 0)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 6)
      .map(([k]) => assinatura.rotulos[k]?.texto || k),
  };
}
