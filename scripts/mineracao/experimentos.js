// Experimentos das melhorias do MovieLens, seguindo o protocolo aprovado (Fase 1):
//   1. Cada variação é medida no conjunto de VALIDAÇÃO (que não entra na mineração).
//   2. A melhor variação que cumpre a regra entra; senão, a melhoria é descartada.
//   3. A escolhida é conferida UMA vez no conjunto de TESTE (mesmas pessoas e semente de antes).
//      Se no teste ela não cumprir os critérios A5 e A6, é revertida (critério A10).
// As melhorias são acumulativas: cada uma parte da configuração aceita até ali.
//
// Uso: npm run mineracao:experimentos   (gera docs/mineracao/experimentos.md e .json)
//      --lambdas=500,2000   valores de λ do EASE (cada um leva alguns minutos)

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { avaliar, carregarConjunto } from './avaliacao.js';
import { lerArgumentos, MODELO_ORIGINAL, montarConfig, RAIZ } from './config.js';
import { carregarConteudo } from './conteudo.js';
import { etapa3Transformacao } from './etapa3-transformacao.js';
import { contarCoocorrencia } from './etapa4-mineracao.js';
import { construirVizinhos } from './similaridade.js';
import { segundos } from './util.js';

const args = lerArgumentos();
const cfg = montarConfig({ base: args.base || 'completa' });
const LAMBDAS = String(args.lambdas || '500,2000').split(',').map(Number).filter(Boolean);
const inicio = Date.now();

if (!existsSync(path.join(cfg.dirProcessado, 'etapa3-validacao-notas.bin')) || args['refazer-etapa3']) {
  console.log('▶ Etapa 3 (com o conjunto de validação)');
  await etapa3Transformacao(cfg);
}
const validacao = carregarConjunto(cfg, 'validacao');
const teste = carregarConjunto(cfg, 'teste');
console.log(`Validação: ${validacao.length} pessoas · Teste: ${teste.length} pessoas`);

// Contagens (uma vez sem recência; com recência só se algum experimento pedir)
const contagens = new Map();
const contar = (meiaVida) => {
  if (!contagens.has(meiaVida)) contagens.set(meiaVida, contarCoocorrencia({ ...cfg, parametros: { ...cfg.parametros, meiaVidaPessoaDias: meiaVida } }));
  return contagens.get(meiaVida);
};
const conteudo = await carregarConteudo(cfg, ['tmdb', 'tags', 'genome']);

// Cache das listas de vizinhos por configuração de similaridade
const cacheViz = new Map();
function vizinhosDe(p) {
  const chave = JSON.stringify([p.modelo, p.alfa, p.meiaVidaPessoaDias, p.conteudo, p.gamaConteudo, p.easeLambda, p.vizinhosPorFilme]);
  if (!cacheViz.has(chave)) {
    const t = Date.now();
    const dados = contar(p.meiaVidaPessoaDias || 0);
    cacheViz.set(chave, { ...construirVizinhos(dados, p, conteudo, { dirCache: cfg.dirProcessado }), curtidas: dados.curtidas, U: dados.U });
    console.log(`   vizinhos ${chave} em ${segundos(t)}`);
  }
  return cacheViz.get(chave);
}
function medir(p, conjunto, coldStart = false) {
  const v = vizinhosDe(p);
  const grandes = p.easeAPartirDe > 0 ? vizinhosDe({ ...p, modelo: 'ease', conteudo: [], gamaConteudo: 0 }).vizinhos : null;
  return avaliar(conjunto, { vizinhos: v.vizinhos, vizinhosGrandes: grandes, minimoGrandes: p.easeAPartirDe, curtidas: v.curtidas, U: v.U }, p, { coldStart });
}

// ---------- Regras de decisão (critérios A5, A6 e A10, fixados antes de implementar) ----------
const naoPiora = (x, ref) => x.ndcg_10 >= ref.ndcg_10 && x.hit_rate_10 >= ref.hit_rate_10;
// "Uma mudança só fica se melhorar": na validação, o NDCG precisa SUBIR (empate não basta)
const melhora = (x, ref) => x.ndcg_10 > ref.ndcg_10 && x.hit_rate_10 >= ref.hit_rate_10;
const excecaoPopularidade = (x, b0) => x.ndcg_10 >= 0.95 * b0.ndcg_10 && x.hit_rate_10 >= b0.hit_rate_10 && x.posicao_popularidade >= 0.03 && x.cobertura >= 0.15;

function criterioTeste(melhoria, r, b0, anterior) {
  const m = r.modelo;
  const falhas = [];
  const okA5 = naoPiora(m, b0.modelo) || (melhoria === 'M2' && excecaoPopularidade(m, b0.modelo));
  if (!okA5) falhas.push('A5: NDCG@10 ou HitRate@10 abaixo da linha de base');
  if (melhoria !== 'M2' && anterior && !naoPiora(m, anterior.modelo)) falhas.push('piorou em relação à melhoria anterior');
  const c20 = r.cold_start?.[20];
  const b20 = b0.cold_start?.[20];
  if (c20 && b20 && (c20.hit_rate_10 < b20.hit_rate_10 || c20.ndcg_10 < b20.ndcg_10)) falhas.push('A6: cold start com 20 títulos piorou');
  for (const k of [5, 10, 20, 40]) {
    if (r.cold_start?.[k] && r.cold_start[k].hit_rate_10 <= r.cold_start_populares.hit_rate_10) falhas.push(`A6: com ${k} títulos não supera "mais populares"`);
  }
  return falhas;
}

// ---------- Melhorias e variações ----------
const MELHORIAS = [
  { id: 'M1', nome: 'Base completa (todos os títulos, sem limite de 12 favoritos)', variacoes: () => [{ limiteBase: 0 }] },
  { id: 'M2', nome: 'Viés de popularidade (cosseno assimétrico, α)', variacoes: () => [0.55, 0.6, 0.7, 0.8].map((alfa) => ({ alfa })) },
  {
    id: 'M3',
    nome: 'Intensidade das notas e sinal negativo; EASE',
    variacoes: (atual) => [{ pesoUsuario: 'notas' }, ...LAMBDAS.flatMap((l) => [{ modelo: 'ease', easeLambda: l }, { modelo: 'ease', easeLambda: l, pesoUsuario: 'notas' }])].map((v) => ({ ...v, _base: atual })),
  },
  { id: 'M4', nome: 'Recência (notas da pessoa e pessoas da mineração)', variacoes: () => [{ meiaVidaUsuarioDias: 730 }, { meiaVidaPessoaDias: 1825 }, { meiaVidaUsuarioDias: 730, meiaVidaPessoaDias: 1825 }] },
  { id: 'M5', nome: 'Conteúdo do TMDB (palavras-chave, direção, elenco, coleção)', variacoes: (a) => [0.1, 0.2, 0.35].map((g) => ({ conteudo: ['tmdb'], gamaConteudo: g })), conteudo: true },
  { id: 'M6a', nome: 'Conteúdo: tags do MovieLens', variacoes: (a) => [0.1, 0.2, 0.35].map((g) => ({ conteudo: [...new Set([...(a.gamaConteudo ? a.conteudo : []), 'tags'])], gamaConteudo: g })), conteudo: true },
  { id: 'M6b', nome: 'Conteúdo: Tag Genome (MovieLens 25M)', variacoes: (a) => [0.1, 0.2, 0.35].map((g) => ({ conteudo: [...new Set([...(a.gamaConteudo ? a.conteudo : []), 'genome'])], gamaConteudo: g })), conteudo: true },
  {
    id: 'M3b',
    nome: 'Modelo por tamanho da base: EASE para quem tem ≥ 20 títulos (variação criada DEPOIS de ver o teste da M3: o resultado no teste é otimista)',
    variacoes: () => LAMBDAS.map((l) => ({ easeAPartirDe: 20, easeLambda: l })),
  },
];

const B0 = { ...cfg.parametros, ...MODELO_ORIGINAL, limiteBase: 0 }; // modelo original, todas as curtidas
const b0Val = medir(B0, validacao).modelo;
const b0Teste = medir(B0, teste, true);
// O app antigo só olhava 12 favoritos: medimos também esse cenário, como "antes" da melhoria 1
const antigoTeste = medir({ ...B0, limiteBase: 12 }, teste, true);
const antigoVal = medir({ ...B0, limiteBase: 12 }, validacao).modelo;

const historico = [];
let atual = { ...B0, limiteBase: 12 };
let atualVal = antigoVal;
let atualTeste = antigoTeste;

for (const m of MELHORIAS) {
  console.log(`\n▶ ${m.id}: ${m.nome}`);
  const linhas = [];
  for (const v of m.variacoes(atual)) {
    const { _base, ...mudanca } = v;
    const cand = { ...atual, ...mudanca };
    const r = medir(cand, validacao).modelo;
    const ok = m.id === 'M2' ? melhora(r, atualVal) || excecaoPopularidade(r, b0Val) : melhora(r, atualVal);
    linhas.push({ mudanca, val: r, passa_validacao: ok });
    console.log(`   ${JSON.stringify(mudanca)} → NDCG ${r.ndcg_10.toFixed(4)} · Hit ${(r.hit_rate_10 * 100).toFixed(1)}% · pop top ${(r.posicao_popularidade * 100).toFixed(1)}% · cob ${(r.cobertura * 100).toFixed(1)}% ${ok ? '✔' : '✖'}`);
  }
  const aprovadas = linhas.filter((l) => l.passa_validacao).sort((a, b) => b.val.ndcg_10 - a.val.ndcg_10);
  const registro = { id: m.id, nome: m.nome, antes: { params: resumoParams(atual), val: atualVal, teste: atualTeste.modelo }, variacoes: linhas, decisao: null };
  if (!aprovadas.length) {
    registro.decisao = { aceita: false, motivo: 'nenhuma variação cumpriu a regra na validação' };
    historico.push(registro);
    continue;
  }
  const escolhida = { ...atual, ...aprovadas[0].mudanca };
  const rTeste = medir(escolhida, teste, true);
  const falhas = m.id === 'M1' ? criterioTeste('M1', rTeste, antigoTeste, null) : criterioTeste(m.id, rTeste, b0Teste, atualTeste);
  registro.depois = { params: resumoParams(escolhida), val: aprovadas[0].val, teste: rTeste.modelo, cold_start: rTeste.cold_start };
  if (falhas.length) {
    registro.decisao = { aceita: false, motivo: `revertida no teste (${falhas.join('; ')})`, mudanca: aprovadas[0].mudanca };
  } else {
    registro.decisao = { aceita: true, mudanca: aprovadas[0].mudanca };
    atual = escolhida;
    atualVal = aprovadas[0].val;
    atualTeste = rTeste;
  }
  console.log(`   ${registro.decisao.aceita ? '✅ aceita' : '❌ ' + registro.decisao.motivo}`);
  historico.push(registro);
}

function resumoParams(p) {
  return {
    modelo: p.modelo, alfa: p.alfa, easeLambda: p.modelo === 'ease' || p.easeAPartirDe ? p.easeLambda : undefined, easeAPartirDe: p.easeAPartirDe || undefined, pesoUsuario: p.pesoUsuario,
    meiaVidaUsuarioDias: p.meiaVidaUsuarioDias, meiaVidaPessoaDias: p.meiaVidaPessoaDias,
    conteudo: p.gamaConteudo ? p.conteudo : [], gamaConteudo: p.gamaConteudo, limiteBase: p.limiteBase,
  };
}

// ---------- Relatório ----------
const pc = (x) => `${(x * 100).toFixed(1).replace('.', ',')}%`;
const nd = (x) => x.toFixed(4).replace('.', ',');
const linhaM = (nome, x) => `| ${nome} | ${pc(x.hit_rate_10)} | ${pc(x.precision_10)} | ${pc(x.recall_10)} | ${nd(x.ndcg_10)} | top ${pc(x.posicao_popularidade)} | ${pc(x.cobertura)} |`;
const cab = '| | HitRate@10 | Precision@10 | Recall@10 | NDCG@10 | Posição de popularidade | Cobertura |\n|---|---:|---:|---:|---:|---:|---:|';
const md = [];
md.push('# Experimentos do MovieLens: antes × depois', '');
md.push(`Gerado em ${new Date().toLocaleString('pt-BR')} por \`npm run mineracao:experimentos\` (${segundos(inicio)}).`, '');
md.push('Protocolo: variações medidas na **validação**; a escolhida é conferida **uma vez** no **teste** (as mesmas 3.000 pessoas e a mesma semente da linha de base). Critérios A5, A6 e A10 aprovados antes da implementação.', '');
md.push('## Linha de base (teste)', '', cab, linhaM('App antigo (12 favoritos)', antigoTeste.modelo), linhaM('B0′: modelo original, todas as curtidas', b0Teste.modelo), linhaM('Só os mais populares', b0Teste.populares), '');
for (const h of historico) {
  md.push(`## ${h.id}: ${h.nome}`, '', `**Decisão:** ${h.decisao.aceita ? '✅ aceita' : '❌ não entrou'}${h.decisao.motivo ? ` (${h.decisao.motivo})` : ''}`, '');
  md.push('Validação:', '', cab, linhaM('antes', h.antes.val));
  for (const v of h.variacoes) md.push(linhaM(`${JSON.stringify(v.mudanca).replace(/"/g, '')} ${v.passa_validacao ? '✔' : '✖'}`, v.val));
  md.push('');
  if (h.depois) md.push('Teste (antes × depois):', '', cab, linhaM('antes', h.antes.teste), linhaM('depois', h.depois.teste), '');
}
md.push('## Cold start (teste): linha de base × configuração final', '', '| Títulos | HitRate B0′ | HitRate final | NDCG B0′ | NDCG final | Popularidade final | Cobertura final |', '|---:|---:|---:|---:|---:|---:|---:|');
for (const k of Object.keys(b0Teste.cold_start)) {
  const a = b0Teste.cold_start[k];
  const b = atualTeste.cold_start[k];
  md.push(`| ${k} | ${pc(a.hit_rate_10)} | ${pc(b.hit_rate_10)} | ${nd(a.ndcg_10)} | ${nd(b.ndcg_10)} | top ${pc(b.posicao_popularidade)} | ${pc(b.cobertura)} |`);
}
md.push(`| mais populares | ${pc(b0Teste.cold_start_populares.hit_rate_10)} | | ${nd(b0Teste.cold_start_populares.ndcg_10)} | | | |`, '');
md.push('## Configuração final', '', '```json', JSON.stringify(resumoParams(atual), null, 2), '```', '');

// Só a base completa vai para docs/; a base de teste fica na pasta de dados
const dirDocs = cfg.base === 'completa' ? path.join(RAIZ, 'docs', 'mineracao') : cfg.dirProcessado;
mkdirSync(dirDocs, { recursive: true });
writeFileSync(path.join(dirDocs, 'experimentos.md'), md.join('\n') + '\n');
writeFileSync(path.join(dirDocs, 'experimentos.json'), JSON.stringify({ gerado_em: new Date().toISOString(), b0: b0Teste, antigo: antigoTeste, final: { params: resumoParams(atual), teste: atualTeste }, melhorias: historico }, null, 2));
console.log(`\n✅ Experimentos em ${segundos(inicio)}. Relatório: docs/mineracao/experimentos.md`);
console.log('Configuração final:', JSON.stringify(resumoParams(atual)));
