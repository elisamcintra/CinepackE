// ETAPA 3 DO KDD: TRANSFORMAÇÃO
// 2ª passada pelas notas. Cada usuário vira uma "transação" (como um carrinho de compras):
// a lista de filmes que ele GOSTOU. "Gostou" = nota >= 4 E nota >= média da própria pessoa
// (quem dá 5 para tudo não "gosta" de tudo igual).
//
// Também separamos dois grupos de pessoas que NÃO entram na mineração:
//   - TESTE (2%): usado só para a comparação final de cada melhoria (etapa 5 e experimentos);
//   - VALIDAÇÃO (outros 2%): usado para escolher parâmetros, para não "decorar" o teste.
// O sorteio é por hash do ID: a mesma pessoa cai sempre no mesmo grupo, e o teste é o mesmo de antes.
//
// Formato dos arquivos de curtidas .bin (Int32): [quantidade, filme1, filme2, ..., quantidade, filme1, ...]
// onde "filme" é a posição do filme na lista da etapa 2.
// Notas completas (teste e validação), Int32: [quantidade, média×1000, filme, nota×2, dia, filme, nota×2, dia, ...]
// Dia médio das curtidas de cada pessoa do treino (Int32, dias desde 1970), na mesma ordem do treino.

import path from 'node:path';
import { lerNota } from './etapa2-preprocessamento.js';
import { lerBinario, lerJson, lerLinhas, salvarBinario, salvarJson, VetorCrescente } from './util.js';

// Sorteio fixo de quem é "teste" (sempre o mesmo usuário cai no mesmo grupo)
export function ehUsuarioDeTeste(usuario, fracao) {
  return hashUsuario(usuario) < fracao * 10000;
}

const hashUsuario = (usuario) => (Math.imul(usuario, 2654435761) >>> 0) % 10000;

// 'teste' | 'validacao' | 'treino' (as faixas do hash não se sobrepõem)
export function grupoDoUsuario(usuario, fracaoTeste, fracaoValidacao = 0) {
  const h = hashUsuario(usuario);
  if (h < fracaoTeste * 10000) return 'teste';
  if (h < (fracaoTeste + fracaoValidacao) * 10000) return 'validacao';
  return 'treino';
}

const DIA_S = 86400;

class Escritor {
  constructor() {
    this.vetor = new VetorCrescente(Int32Array, 1 << 16);
    this.pos = 0;
    this.transacoes = 0;
  }
  escrever(ids) {
    this.vetor.garantir(this.pos + ids.length + 1);
    this.vetor.dados[this.pos++] = ids.length;
    for (const id of ids) this.vetor.dados[this.pos++] = id;
    this.transacoes++;
  }
  resultado() {
    return this.vetor.dados.subarray(0, this.pos);
  }
}

export async function etapa3Transformacao(cfg) {
  const p = cfg.parametros;
  const itens = lerJson(cfg.dirProcessado, 'etapa2-itens.json');
  const medias = lerBinario(cfg.dirProcessado, 'etapa2-medias.bin', Float32Array);

  // movieId -> posição na lista de itens (-1 = filme removido)
  const maiorFilme = itens.reduce((m, f) => Math.max(m, f.movieId), 0);
  const posicaoDoFilme = new Int32Array(maiorFilme + 1).fill(-1);
  itens.forEach((f, i) => (posicaoDoFilme[f.movieId] = i));

  const treino = new Escritor();
  const teste = new Escritor();
  const validacao = new Escritor();
  const notasTeste = new Escritor();
  const notasValidacao = new Escritor();
  const tempoTreino = new VetorCrescente(Int32Array, 1 << 16);
  let usuarioAtual = -1;
  let notas = [];
  let curtidas = 0;
  let semCurtidas = 0;

  const fecharUsuario = () => {
    if (usuarioAtual < 0) return;
    const media = medias[usuarioAtual];
    if (Number.isNaN(media) || media === undefined) return;
    let gostos = notas.filter((n) => n.nota >= p.notaMinimaGostou && n.nota >= media);
    if (gostos.length > p.maxGostosPorUsuario) {
      // Fica com os de nota mais alta (e, no empate, os mais recentes)
      gostos = gostos.sort((a, b) => b.nota - a.nota || b.quando - a.quando).slice(0, p.maxGostosPorUsuario);
    }
    if (gostos.length < 2) {
      semCurtidas++;
      return;
    }
    curtidas += gostos.length;
    const grupo = grupoDoUsuario(usuarioAtual, p.fracaoTeste, p.fracaoValidacao || 0);
    const ids = gostos.map((g) => g.filme);
    if (grupo === 'treino') {
      tempoTreino.garantir(treino.transacoes + 1);
      tempoTreino.dados[treino.transacoes] = Math.round(gostos.reduce((s, g) => s + g.quando, 0) / gostos.length / DIA_S);
      treino.escrever(ids);
      return;
    }
    (grupo === 'teste' ? teste : validacao).escrever(ids);
    // Todas as notas (não só as curtidas), para testar pesos, notas negativas e recência
    const todas = [Math.round(media * 1000)];
    for (const n of notas) todas.push(n.filme, Math.round(n.nota * 2), Math.floor(n.quando / DIA_S));
    (grupo === 'teste' ? notasTeste : notasValidacao).escrever(todas);
  };

  await lerLinhas(
    path.join(cfg.dirBruto, 'ratings.csv'),
    (linha) => {
      const n = lerNota(linha);
      if (n.usuario !== usuarioAtual) {
        if (n.usuario < usuarioAtual) throw new Error('ratings.csv precisa estar ordenado por userId (como no arquivo original).');
        fecharUsuario();
        usuarioAtual = n.usuario;
        notas = [];
      }
      const pos = n.filme <= maiorFilme ? posicaoDoFilme[n.filme] : -1;
      if (pos >= 0) notas.push({ filme: pos, nota: n.nota, quando: n.quando });
    },
    { rotulo: 'Lendo notas (2ª passada)' }
  );
  fecharUsuario();

  const estatisticas = {
    transacoes_treino: treino.transacoes,
    transacoes_teste: teste.transacoes,
    transacoes_validacao: validacao.transacoes,
    curtidas_total: curtidas,
    media_curtidas_por_usuario: Math.round((curtidas / Math.max(1, treino.transacoes + teste.transacoes)) * 10) / 10,
    usuarios_sem_curtidas_suficientes: semCurtidas,
  };
  console.log(
    `   ${treino.transacoes.toLocaleString('pt-BR')} transações de treino, ${teste.transacoes.toLocaleString('pt-BR')} de teste e ${validacao.transacoes.toLocaleString('pt-BR')} de validação`
  );

  salvarBinario(cfg.dirProcessado, 'etapa3-treino.bin', treino.resultado());
  salvarBinario(cfg.dirProcessado, 'etapa3-teste.bin', teste.resultado());
  salvarBinario(cfg.dirProcessado, 'etapa3-validacao.bin', validacao.resultado());
  salvarBinario(cfg.dirProcessado, 'etapa3-teste-notas.bin', notasTeste.resultado());
  salvarBinario(cfg.dirProcessado, 'etapa3-validacao-notas.bin', notasValidacao.resultado());
  salvarBinario(cfg.dirProcessado, 'etapa3-treino-tempo.bin', tempoTreino.dados.subarray(0, treino.transacoes));
  salvarJson(cfg.dirProcessado, 'etapa3-estatisticas.json', estatisticas);
  return estatisticas;
}

// Percorre um arquivo de transações: fn(listaDeFilmes)
export function paraCadaTransacao(dados, fn) {
  let pos = 0;
  while (pos < dados.length) {
    const k = dados[pos++];
    fn(dados.subarray(pos, pos + k));
    pos += k;
  }
}
