// Pontuação "sem IA": compara um título com o perfil do usuário.
// É sempre a primeira ordenação, e o plano B quando a IA falha.
//
// O que entra na nota de cada candidato:
//   1. Assinatura de gosto: temas, diretores, elenco, idioma e década em comum com os favoritos
//   2. Consenso: quantos títulos que a pessoa amou levam a este (recomendações do TMDB)
//   3. Sugestão da IA (conhecimento de cinema), já verificada na Netflix
//   3b. Filtragem colaborativa (MovieLens): todos os seus filmes da base, com pesos (movielensBase.js)
//   4. Gêneros favoritos / evitados e idiomas preferidos
//   5. Qualidade: nota bayesiana (desconfia de notas altas com poucos votos)
//   6. Formato preferido (filmes curtos, minisséries...)

import { CLIMAS, chavesDoTitulo, nomeGenero } from '../lib/genres.js';
import { adjetivoIdioma } from '../lib/languages.js';
import { similaridade } from './tasteSignature.js';

// Nota bayesiana (mesma ideia do ranking do IMDb):
// um 9,0 com 12 votos vale menos que um 8,2 com 20 mil votos.
const VOTOS_CONFIANCA = 300;
const NOTA_MEDIA = 6.8;
export function notaBayesiana(t) {
  const v = t.votos || 0;
  const r = t.nota_tmdb || 0;
  if (!r) return NOTA_MEDIA - 0.3;
  return (v / (v + VOTOS_CONFIANCA)) * r + (VOTOS_CONFIANCA / (v + VOTOS_CONFIANCA)) * NOTA_MEDIA;
}

const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * sinais (opcionais) = {
 *   parecidoCom: 'Dark',      título favorito que levou a este
 *   sementes: 3,              quantos favoritos levam a este
 *   sugeridoPorIA: true,      veio das sugestões da IA
 *   porQueIA: '...'           a justificativa da IA
 *   movielens: { pontos, S, contribuintes, melhor }   (só filmes; ver movielensService.sinalDoCandidato)
 * }
 * Devolve também `componentes`: quanto cada parte somou (o "rastreamento" da nota). score = soma dos componentes.
 */
export function pontuar(t, perfil, sinais = {}) {
  const chaves = chavesDoTitulo(t.tipo, t.genre_ids || []);
  const fav = new Map((perfil?.generos_favoritos || []).map((g) => [g.chave, g.peso]));
  const evita = new Map((perfil?.generos_evitar || []).map((g) => [g.chave, g]));
  const razoes = [];
  const c = { assinatura_tmdb: 0, consenso_tmdb: 0, ia_sugestao: 0, movielens: 0, generos: 0, idioma: 0, palavras_chave: 0, qualidade: 0, formato: 0 };

  // 1. Assinatura de gosto (TMDB: temas, criadores, elenco, idioma, década)
  const sim = similaridade(t, perfil?.assinatura);
  c.assinatura_tmdb = limitar(sim.cos * 10, -3, 3.5);
  if (c.assinatura_tmdb > 0.5 && sim.destaques.length) razoes.push({ tipo: 'temas', destaques: sim.destaques });

  // 2. Consenso entre favoritos (recomendações do TMDB)
  if (sinais.parecidoCom) {
    c.consenso_tmdb += 1.2;
    razoes.unshift({ tipo: 'ancora', titulo: sinais.parecidoCom, sementes: sinais.sementes || 1 });
  }
  if (sinais.sementes > 1) c.consenso_tmdb += Math.min(sinais.sementes - 1, 3) * 0.6;

  // 3. Sugestão da IA
  if (sinais.sugeridoPorIA) {
    c.ia_sugestao = 1.2;
    razoes.push({ tipo: 'ia', texto: sinais.porQueIA });
  }

  // 3b. Filtragem colaborativa (MovieLens): toda a base de filmes da pessoa, com pesos (de −1,5 a +3 pontos)
  if (sinais.movielens?.pontos) {
    c.movielens = sinais.movielens.pontos;
    if (sinais.movielens.melhor && c.movielens > 0) razoes.push({ tipo: 'colaborativo', ...sinais.movielens.melhor, quantos: sinais.movielens.quantos });
  }

  // 4. Gêneros e idioma
  for (const k of chaves) {
    if (fav.has(k)) {
      c.generos += 1.4 * fav.get(k);
      razoes.push({ tipo: 'genero', chave: k, peso: fav.get(k) });
    }
    if (evita.has(k)) {
      const g = evita.get(k);
      // Gênero com nuance ("aceita se for europeu") pesa menos contra
      c.generos -= 2 * (g.forca ?? 0.7) * (g.nuance ? 0.4 : 1);
    }
  }
  if (perfil?.idiomas_preferidos?.includes(t.idioma_original)) {
    c.idioma = 0.8;
    razoes.push({ tipo: 'idioma', idioma: t.idioma_original });
  }
  const kwPerfil = new Set((perfil?.palavras_chave || []).map((p) => p.id));
  c.palavras_chave = Math.min((t.palavras_chave || []).filter((k) => kwPerfil.has(k.id)).length * 0.4, 1.2);

  // 5. Qualidade
  const nb = notaBayesiana(t);
  c.qualidade = (nb - NOTA_MEDIA) * 0.9 + Math.min(Math.log10((t.popularidade || 0) + 1), 3) * 0.05;

  // 6. Formato preferido (pergunta 9 do quiz)
  const formato = perfil?.duracao_preferida;
  if (formato === 'filmes_curtos') {
    if (t.tipo === 'tv') c.formato = -2;
    else if (t.duracao > 130) c.formato = -1;
  } else if (formato === 'filmes_ou_minisseries' && t.tipo === 'tv' && t.temporadas > 1) {
    c.formato = -1.5;
  }

  const total = Object.values(c).reduce((a, b) => a + b, 0);
  return {
    score: Math.round(total * 100) / 100,
    componentes: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
    razoes,
    destaques: sim.destaques,
    alertas: sim.alertas,
    notaAjustada: Math.round(nb * 10) / 10,
  };
}

// Converte a pontuação em "% compatível" (curva suave entre 35% e 98%)
export function compatibilidadePorScore(score) {
  const pct = 100 / (1 + Math.exp(-(score - 2.5) / 1.6));
  return Math.round(limitar(pct, 35, 98));
}

const juntar = (lista) => (lista.length > 1 ? `${lista.slice(0, -1).join(', ')} e ${lista.at(-1)}` : lista[0]);

// Frase-modelo de "Por que pra você" quando a IA não está disponível
export function motivoPorRegras(t, razoes = []) {
  const ancora = razoes.find((r) => r.tipo === 'ancora');
  const temas = razoes.find((r) => r.tipo === 'temas');
  const ia = razoes.find((r) => r.tipo === 'ia');
  const colab = razoes.find((r) => r.tipo === 'colaborativo');
  const genero = razoes.filter((r) => r.tipo === 'genero').sort((a, b) => b.peso - a.peso)[0];
  const idioma = razoes.find((r) => r.tipo === 'idioma');
  const notaBoa = t.nota_tmdb >= 7.5 && t.votos >= 100;

  const pessoa = temas?.destaques.find((d) => d.tipo === 'direcao' || d.tipo === 'criacao');
  const temasTexto = temas?.destaques.filter((d) => d.tipo === 'tema').map((d) => d.texto.toLowerCase());

  if (ancora && ancora.sementes > 1) {
    return `Aparece entre os parecidos de ${ancora.sementes} títulos que você curtiu, como "${ancora.titulo}".`;
  }
  if (colab?.titulo && colab.confianca >= 0.25) {
    return `${Math.round(colab.confianca * 100)}% de quem amou "${colab.titulo}" também amou este, segundo as notas de milhares de pessoas do MovieLens.`;
  }
  if (colab?.titulo) {
    const outros = colab.quantos > 1 ? ` e mais ${colab.quantos - 1} ${colab.quantos === 2 ? 'filme seu' : 'filmes seus'}` : '';
    return `Quem gostou de "${colab.titulo}"${outros} também costuma gostar deste, segundo as notas de milhares de pessoas do MovieLens.`;
  }
  if (ancora && temasTexto?.length) return `Parecido com "${ancora.titulo}", que você amou: também tem ${juntar(temasTexto.slice(0, 2))}.`;
  if (ancora) return `Parecido com "${ancora.titulo}", que você amou.`;
  if (pessoa) return `${pessoa.tipo === 'criacao' ? 'Criado' : 'Dirigido'} por ${pessoa.texto}, que assina títulos que você curtiu.`;
  if (ia?.texto) return ia.texto;
  if (temasTexto?.length) return `Tem ${juntar(temasTexto.slice(0, 3))}, temas que se repetem nos títulos que você mais curtiu.`;
  if (genero && idioma) {
    return `Junta seu gosto por ${nomeGenero(genero.chave).toLowerCase()} com produções ${adjetivoIdioma(idioma.idioma)}, que você curte.`;
  }
  if (genero) {
    return `Combina com seu gosto por ${nomeGenero(genero.chave).toLowerCase()}${notaBoa ? ` e tem nota ${t.nota_tmdb} no TMDB` : ''}.`;
  }
  if (idioma) return `Você curte produções ${adjetivoIdioma(idioma.idioma)}: esta é uma delas.`;
  if (notaBoa) return `Muito bem avaliado (${t.nota_tmdb}/10 no TMDB) e disponível na sua Netflix.`;
  return 'Uma aposta diferente para variar, disponível na sua Netflix.';
}

/**
 * Variedade (MMR, "maximal marginal relevance"): escolhe um por um o melhor candidato,
 * descontando o quanto ele se parece com os que já foram escolhidos.
 * Evita uma lista com 10 títulos quase iguais (ex.: todos derivados de "Dark").
 * itens: [{ t, score, sinais }] já ordenados por score.
 */
export function diversificar(itens, { quantidade = itens.length, penalidade = 2.2 } = {}) {
  const caracteristicas = new Map(
    itens.map((x) => [
      x,
      new Set([
        ...chavesDoTitulo(x.t.tipo, x.t.genre_ids || []).map((g) => `g:${g}`),
        ...(x.t.palavras_chave || []).slice(0, 8).map((k) => `k:${k.id}`),
        ...(x.sinais?.parecidoCom ? [`s:${x.sinais.parecidoCom}`, `s:${x.sinais.parecidoCom}`] : []),
        `t:${x.t.tipo}`,
      ]),
    ])
  );
  const jaccard = (a, b) => {
    let comum = 0;
    for (const v of a) if (b.has(v)) comum++;
    return comum / (a.size + b.size - comum || 1);
  };

  const escolhidos = [];
  const resto = [...itens];
  while (resto.length && escolhidos.length < quantidade) {
    let melhor = 0;
    let melhorValor = -Infinity;
    for (let i = 0; i < resto.length; i++) {
      const c = caracteristicas.get(resto[i]);
      let maxSim = 0;
      for (const e of escolhidos) maxSim = Math.max(maxSim, jaccard(c, caracteristicas.get(e)));
      const valor = resto[i].score - penalidade * maxSim;
      if (valor > melhorValor) {
        melhorValor = valor;
        melhor = i;
      }
    }
    escolhidos.push(resto.splice(melhor, 1)[0]);
  }
  return [...escolhidos, ...resto];
}

/**
 * Humor do dia: reordena (clima) e filtra (tempo disponível).
 * tempo: 'ate_1h30' | 'ate_2h' | 'maratona'
 * clima: 'leve' | 'intenso' | 'pensar' | 'rir' | 'chorar'
 * Garante no mínimo `minimo` itens: se o filtro de tempo deixar poucos, completa com os demais.
 */
export function aplicarHumor(itens, { clima, tempo } = {}, minimo = 10) {
  if (!clima && !tempo) return { itens, aviso: null };
  const pesos = CLIMAS[clima] || {};

  const comBonus = itens.map((t, i) => {
    let bonus = 0;
    for (const k of chavesDoTitulo(t.tipo, t.genre_ids || [])) bonus += (pesos[k] || 0) * 2;
    if (tempo === 'maratona' && t.tipo === 'tv') bonus += 2;
    if (tempo && tempo !== 'maratona' && t.tipo === 'movie') bonus += 0.5;
    // A posição original (ranking do perfil) continua contando
    return { t, valor: bonus - i * 0.15 };
  });

  const cabe = ({ t }) => {
    if (t.tipo !== 'movie' || !t.duracao) return true;
    if (tempo === 'ate_1h30') return t.duracao <= 95;
    if (tempo === 'ate_2h') return t.duracao <= 125;
    return true;
  };

  const ordenados = comBonus.sort((a, b) => b.valor - a.valor);
  const dentro = ordenados.filter(cabe);
  const fora = ordenados.filter((x) => !cabe(x));
  let aviso = null;
  let lista = dentro;
  if (dentro.length < minimo) {
    lista = [...dentro, ...fora.slice(0, minimo - dentro.length)];
    if (fora.length) aviso = 'Poucos títulos cabem no tempo escolhido; completamos com alguns um pouco mais longos.';
  }
  return { itens: lista.map((x) => x.t), aviso };
}
