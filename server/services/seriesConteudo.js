// Similaridade de CONTEÚDO entre séries (TF-IDF), a partir das fichas do TMDB (seriesFichas.js).
//
// Cada série vira 6 vetores, um por "campo", e cada campo tem um peso fixo:
//   sinopse (palavras da sinopse em inglês) 0,30 · temas (palavras-chave do TMDB) 0,30 · gêneros 0,10
//   criadores 0,10 · elenco fixo 0,10 · origem (país, idioma, emissora) 0,10
// TF-IDF: um termo raro no catálogo ("time loop") vale mais que um comum ("drama"), ao contrário da assinatura
// de gosto, que soma tudo com o mesmo valor.
// Similaridade entre duas séries = média ponderada dos cossenos de cada campo, só com os campos que AS DUAS têm
// (21% das séries não têm criador no TMDB: sem isso elas seriam punidas por falta de dado).

export const PESOS_CAMPOS = { sinopse: 0.3, temas: 0.3, generos: 0.1, criadores: 0.1, elenco: 0.1, origem: 0.1 };
const CAMPOS = Object.keys(PESOS_CAMPOS);

// Palavras sem conteúdo (inglês), fora da sinopse
const VAZIAS = new Set(
  `a about after again against all also an and any are as at be because been before being between both but by can
could did do does doing down during each few for from further had has have having he her here hers herself him himself
his how i if in into is it its itself just me more most my new no nor not now of off on once one only or other our out
over own same she should so some such than that the their them then there these they this those through to too two
under until up very was we were what when where which while who whom why will with would you your series show season
episode episodes life lives world find finds must take takes way when while help back get gets make makes year years
first last time young become becomes`.split(/\s+/)
);

export function palavras(texto) {
  return (String(texto || '').toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []).map((w) => w.replace(/'s$/, '')).filter((w) => !VAZIAS.has(w));
}

// Termos de cada campo de uma ficha (antes do TF-IDF)
export function termosDaFicha(f) {
  if (!f || f.ausente) return null;
  const contar = (lista) => lista.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
  return {
    sinopse: contar(palavras(f.sinopse_en)),
    temas: contar((f.temas || []).map(([id]) => `k${id}`)),
    generos: contar((f.generos || []).map((id) => `g${id}`)),
    criadores: contar((f.criadores || []).map(([id]) => `c${id}`)),
    elenco: contar((f.elenco || []).map(([id]) => `a${id}`)),
    origem: contar([...(f.paises || []).map((p) => `p${p}`), f.idioma ? `l${f.idioma}` : null, ...(f.redes || []).map((n) => `n${n}`)].filter(Boolean)),
  };
}

/**
 * Índice TF-IDF sobre um conjunto de fichas (o catálogo + as séries da pessoa).
 * Devolve { vetor(id) -> {campo: Map(termo -> peso)} | null, documentos }.
 */
export function montarIndice(fichas) {
  const termos = new Map();
  for (const f of fichas) {
    const t = termosDaFicha(f);
    if (t) termos.set(f.id, t);
  }
  const N = termos.size;
  const df = Object.fromEntries(CAMPOS.map((c) => [c, new Map()]));
  for (const t of termos.values()) for (const c of CAMPOS) for (const termo of t[c].keys()) df[c].set(termo, (df[c].get(termo) || 0) + 1);
  const idf = (c, termo) => Math.log((N + 1) / ((df[c].get(termo) || 0) + 1)) + 1;

  const vetores = new Map();
  const vetor = (id) => {
    if (vetores.has(id)) return vetores.get(id);
    const t = termos.get(Number(id));
    let v = null;
    if (t) {
      v = {};
      for (const c of CAMPOS) {
        const m = new Map();
        let norma = 0;
        for (const [termo, n] of t[c]) {
          const w = (1 + Math.log(n)) * idf(c, termo);
          m.set(termo, w);
          norma += w * w;
        }
        norma = Math.sqrt(norma);
        if (norma) for (const [termo, w] of m) m.set(termo, w / norma);
        v[c] = m;
      }
    }
    vetores.set(id, v);
    return v;
  };
  // Uma série que chegou depois (ex.: sugerida por outra fonte): entra com o IDF já calculado
  const adicionar = (f) => {
    const t = termosDaFicha(f);
    if (!t || termos.has(f.id)) return;
    termos.set(f.id, t);
    vetores.delete(f.id);
  };
  return { vetor, adicionar, documentos: N };
}

const cosseno = (a, b) => {
  if (!a.size || !b.size) return null;
  const [menor, maior] = a.size < b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [termo, w] of menor) {
    const x = maior.get(termo);
    if (x) s += w * x;
  }
  return s;
};

/** Similaridade (0 a 1) entre dois vetores de série; null se faltar algum. Também devolve o valor por campo. */
export function similaridadeSeries(va, vb) {
  if (!va || !vb) return null;
  let soma = 0;
  let pesos = 0;
  const porCampo = {};
  for (const c of CAMPOS) {
    const s = cosseno(va[c], vb[c]);
    if (s === null) continue;
    porCampo[c] = s;
    soma += PESOS_CAMPOS[c] * s;
    pesos += PESOS_CAMPOS[c];
  }
  return pesos ? { total: soma / pesos, porCampo } : null;
}
