// Roda a mineração de dados completa (as 5 etapas do KDD) ou uma etapa só.
// Uso:
//   npm run mineracao                       -> todas as etapas, base completa
//   npm run mineracao -- --etapa=4          -> só a etapa 4 (usa as saídas das anteriores)
//   npm run mineracao -- --base=pequena     -> base de teste (segundos)

import { existsSync } from 'node:fs';
import path from 'node:path';
import { lerArgumentos, montarConfig } from './config.js';
import { etapa1Selecao } from './etapa1-selecao.js';
import { etapa2Preprocessamento } from './etapa2-preprocessamento.js';
import { etapa3Transformacao } from './etapa3-transformacao.js';
import { etapa4Mineracao } from './etapa4-mineracao.js';
import { etapa5Interpretacao } from './etapa5-interpretacao.js';
import { comCronometro, segundos } from './util.js';

export const ETAPAS = [
  ['Etapa 1: Seleção', etapa1Selecao],
  ['Etapa 2: Pré-processamento', etapa2Preprocessamento],
  ['Etapa 3: Transformação', etapa3Transformacao],
  ['Etapa 4: Mineração (coocorrência, regras de associação, similaridade e k-means)', etapa4Mineracao],
  ['Etapa 5: Interpretação e avaliação', etapa5Interpretacao],
];

export async function executarMineracao(cfg, { etapa } = {}) {
  const escolhidas = etapa ? [ETAPAS[Number(etapa) - 1]].filter(Boolean) : ETAPAS;
  if (!escolhidas.length) throw new Error('Etapa inválida: use de 1 a 5.');
  let ultimo;
  for (const [titulo, fn] of escolhidas) ultimo = await comCronometro(titulo, () => fn(cfg));
  return ultimo;
}

if (process.argv[1]?.endsWith('executar.js')) {
  const args = lerArgumentos();
  const cfg = montarConfig({ base: args.base || 'completa' });
  if (!existsSync(path.join(cfg.dirBruto, 'ratings.csv'))) {
    console.error(`\n❌ Base não encontrada em ${cfg.dirBruto}`);
    console.error(`   Baixe antes: npm run mineracao:baixar${cfg.base === 'pequena' ? ' -- --base=pequena' : ''}\n`);
    process.exit(1);
  }
  console.log(`\n⛏️  Mineração de dados — ${cfg.descricao}`);
  const inicio = Date.now();
  executarMineracao(cfg, { etapa: args.etapa })
    .then(() => {
      console.log(`\n✅ Pronto em ${segundos(inicio)}.`);
      if (!args.etapa || args.etapa === '5') {
        console.log(cfg.base === 'completa' ? '   Reinicie o servidor (npm run dev) para o app usar os novos dados.' : '   (Base de teste: o app continua usando server/data/movielens.json.gz)');
      }
    })
    .catch((e) => {
      console.error(`\n❌ ${e.message}`);
      process.exit(1);
    });
}
