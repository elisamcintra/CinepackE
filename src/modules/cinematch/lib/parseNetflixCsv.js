// Lê o arquivo NetflixViewingHistory.csv e transforma em uma lista de títulos únicos.
//
// O CSV tem uma linha por episódio/filme assistido, por exemplo:
//   Title,Date
//   "Dark: Temporada 1: ""Segredos""",19/10/2026
//   "Stranger Things: Season 2: Chapter One","10/19/26"
//   "Roma","05/03/2024"
//
// O que fazemos aqui:
//   1. Achar as colunas de título e data (aceita "Title"/"Título", "Date"/"Data").
//   2. Detectar o formato da data (dd/mm ou mm/dd) olhando todas as linhas.
//   3. Agrupar episódios em uma série ("Dark: Temporada 1: ..." -> "Dark").
//   4. Remover duplicados e calcular um "peso" de gosto para cada título.
//
// Linhas sem nome (ex.: " : Episódio 3") são ignoradas: a Netflix exporta assim títulos que saíram
// do catálogo. Sem o nome não há como saber o que era, e adivinhar gera favoritos falsos.

import Papa from 'papaparse';
import { MARCADORES, semNome } from './nomesHistorico.js';

export { semNome };

const RE_SERIE = new RegExp(`^(.+?):\\s*(?:${MARCADORES.join('|')})(?=[\\s\\d:]|$)`, 'i');
// Número da temporada/parte/volume, para contar quantas temporadas a pessoa viu
const RE_TEMPORADA = /(?:Temporada|Season|Parte|Part|Volume|Vol\.|Livro|Book|Temp\.)\s*(\d+)/i;

const normalizarChave = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// ---------- Datas ----------

const RE_DATA = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/;

// Olha todas as datas e decide: dia primeiro (BR/Europa), mês primeiro (EUA) ou ano primeiro (ISO)
export function detectarFormatoData(datas) {
  let diaPrimeiro = 0;
  let mesPrimeiro = 0;
  let anoPrimeiro = 0;
  for (const s of datas) {
    const m = RE_DATA.exec((s || '').trim());
    if (!m) continue;
    if (m[1].length === 4) {
      anoPrimeiro++;
      continue;
    }
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) diaPrimeiro++;
    if (b > 12 && a <= 12) mesPrimeiro++;
  }
  if (anoPrimeiro && !diaPrimeiro && !mesPrimeiro) return 'ymd';
  if (mesPrimeiro > diaPrimeiro) return 'mdy';
  return 'dmy'; // empate ou nada conclusivo: padrão brasileiro
}

export function lerData(s, formato) {
  const m = RE_DATA.exec((s || '').trim());
  if (!m) return null;
  let [, p1, p2, p3] = m;
  let dia, mes, ano;
  if (formato === 'ymd' || p1.length === 4) [ano, mes, dia] = [p1, p2, p3];
  else if (formato === 'mdy') [mes, dia, ano] = [p1, p2, p3];
  else [dia, mes, ano] = [p1, p2, p3];

  let a = Number(ano);
  if (ano.length <= 2) {
    // "26" -> 2026; "98" -> 1998
    const seculoAtual = new Date().getFullYear() % 100;
    a += a > seculoAtual + 1 ? 1900 : 2000;
  }
  const d = Number(dia);
  const mm = Number(mes);
  if (!(mm >= 1 && mm <= 12 && d >= 1 && d <= 31 && a >= 1990 && a <= 2100)) return null;
  const data = new Date(Date.UTC(a, mm - 1, d));
  if (data.getUTCDate() !== d) return null; // ex.: 31/02
  return data.toISOString().slice(0, 10);
}

// ---------- Agrupamento ----------

// Separa "Dark: Temporada 1: Segredos" em { base: "Dark", serie: true }
export function analisarTitulo(titulo) {
  const t = titulo.trim().replace(/\s+/g, ' ');
  const m = RE_SERIE.exec(t);
  if (m) return { base: m[1].trim(), serie: true, temporada: RE_TEMPORADA.exec(t)?.[1] || null };
  return { base: t, serie: false, temporada: null };
}

// Peso de gosto: -1 (largou) a 1 (gosto forte)
export function calcularPeso(item) {
  if (item.tipoProvavel === 'tv') {
    const eps = item.episodios;
    if (item.temporadas >= 2 || eps >= 10) return 1;
    if (eps >= 5) return 0.7;
    if (eps >= 3) return 0.4;
    return -0.3; // parou no episódio 1 ou 2: provavelmente não gostou
  }
  return item.vezes >= 2 ? 1 : 0.5; // filme visto mais de uma vez = gosto forte
}

/**
 * Recebe as linhas [{ titulo, data }] e devolve os títulos únicos agrupados.
 */
export function agruparHistorico(linhas) {
  // Contagem de prefixos "X:" para pegar séries sem a palavra "Temporada" (ex.: "Love, Death & Robots: Três Robôs")
  const prefixos = new Map();
  for (const { titulo } of linhas) {
    const i = titulo.indexOf(':');
    if (i > 0) {
      const p = normalizarChave(titulo.slice(0, i));
      prefixos.set(p, (prefixos.get(p) || 0) + 1);
    }
  }

  const grupos = new Map();
  for (const { titulo, data } of linhas) {
    let { base, serie, temporada } = analisarTitulo(titulo);
    const doisPontos = (titulo.match(/:/g) || []).length;

    if (!serie && doisPontos >= 1) {
      const p = titulo.slice(0, titulo.indexOf(':')).trim();
      if ((prefixos.get(normalizarChave(p)) || 0) >= 4) {
        base = p;
        serie = true;
      }
    }

    const chave = normalizarChave(base);
    let g = grupos.get(chave);
    if (!g) {
      g = { titulo: base, original: titulo, linhas: 0, serie: false, doisPontosMax: 0, temporadas: new Set(), datas: [] };
      grupos.set(chave, g);
    }
    g.linhas++;
    g.serie ||= serie;
    g.doisPontosMax = Math.max(g.doisPontosMax, doisPontos);
    if (temporada) g.temporadas.add(temporada);
    if (data) g.datas.push(data);
  }

  const itens = [];
  for (const g of grupos.values()) {
    // "Star Wars: Episódio IV" aparece 1 vez e só tem um ":" -> é filme, não série
    const ehSerie = g.serie && (g.linhas >= 2 || g.doisPontosMax >= 2);
    const datas = g.datas.sort();
    const item = {
      titulo: ehSerie ? g.titulo : g.linhas === 1 ? g.original.trim() : g.titulo,
      tituloBusca: ehSerie ? g.titulo : g.original.trim(),
      tipoProvavel: ehSerie ? 'tv' : 'movie',
      episodios: ehSerie ? g.linhas : 0,
      vezes: ehSerie ? 1 : g.linhas,
      temporadas: g.temporadas.size,
      primeiraData: datas[0] || null,
      ultimaData: datas.at(-1) || null,
    };
    // Um episódio só de uma série ("Zero: Episódio 1"): também vale procurar a série "Zero" pelo nome exato
    if (g.serie && !ehSerie && g.titulo !== item.tituloBusca) item.tituloSerie = g.titulo;
    item.peso = calcularPeso(item);
    itens.push(item);
  }

  return itens.sort((a, b) => b.peso - a.peso || (b.ultimaData || '').localeCompare(a.ultimaData || ''));
}

// ---------- Leitura do arquivo ----------

const RE_COL_TITULO = /^(title|t[ií]tulo|titulo|nome|name)$/i;
const RE_COL_DATA = /^(date|data|fecha|datum)$/i;

export function parseNetflixCsvText(texto) {
  const res = Papa.parse(texto, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.replace(/^﻿/, '').trim(),
  });
  const campos = res.meta.fields || [];
  let colTitulo = campos.find((c) => RE_COL_TITULO.test(c));
  let colData = campos.find((c) => RE_COL_DATA.test(c));
  // Sem cabeçalho reconhecível, mas com 2 colunas: assume título e data
  if (!colTitulo && campos.length >= 1) colTitulo = campos[0];
  if (!colData && campos.length >= 2) colData = campos.find((c) => c !== colTitulo);

  if (!colTitulo || !res.data.length) {
    throw new Error('Não encontramos títulos neste arquivo. Ele é o NetflixViewingHistory.csv?');
  }

  const brutas = res.data
    .map((r) => ({ titulo: String(r[colTitulo] ?? '').trim(), dataBruta: colData ? String(r[colData] ?? '').trim() : '' }))
    .filter((r) => r.titulo);
  if (!brutas.length) throw new Error('O arquivo está vazio. Confira se você escolheu o perfil certo na Netflix.');

  const formato = detectarFormatoData(brutas.map((r) => r.dataBruta));
  const comNome = brutas.filter((r) => !semNome(r.titulo));
  const linhas = comNome.map((r) => ({ titulo: r.titulo, data: lerData(r.dataBruta, formato) }));
  const itens = agruparHistorico(linhas);

  return {
    itens,
    totalLinhas: brutas.length,
    linhasSemNome: brutas.length - comNome.length,
    formatoData: formato,
    colunas: { titulo: colTitulo, data: colData || null },
  };
}

export function parseNetflixCsv(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo) return reject(new Error('Nenhum arquivo escolhido.'));
    if (!/\.csv$/i.test(arquivo.name) && arquivo.type !== 'text/csv') {
      return reject(new Error('Escolha o arquivo .csv baixado da Netflix (NetflixViewingHistory.csv).'));
    }
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.onload = () => {
      try {
        resolve(parseNetflixCsvText(String(leitor.result)));
      } catch (e) {
        reject(e);
      }
    };
    leitor.readAsText(arquivo, 'utf-8');
  });
}
