// Baixa e extrai a base MovieLens para dados/movielens/bruto/.
// Uso:  npm run mineracao:baixar              (base completa, 239 MB)
//       node scripts/mineracao/baixar.js --base=pequena   (base de teste, ~1 MB)

import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { lerArgumentos, montarConfig } from './config.js';
import { garantirPasta, segundos } from './util.js';

const LICENCA = `
  📄 Licença do MovieLens (GroupLens Research, Universidade de Minnesota):
     - uso permitido para pesquisa/fins não comerciais;
     - cite: F. Maxwell Harper and Joseph A. Konstan. 2015. The MovieLens Datasets: History and Context.
       ACM Transactions on Interactive Intelligent Systems (TiiS) 5, 4: 19:1–19:19.
     - não sugira que a Universidade de Minnesota ou o GroupLens endossam este projeto.`;

async function baixar(url, destino) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download falhou (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  let recebido = 0;
  let ultimo = 0;
  const inicio = Date.now();
  const comProgresso = Readable.fromWeb(res.body).on('data', (pedaco) => {
    recebido += pedaco.length;
    if (Date.now() - ultimo > 500) {
      ultimo = Date.now();
      const mb = (recebido / 1e6).toFixed(0);
      const texto = total ? `${mb} de ${(total / 1e6).toFixed(0)} MB (${Math.round((recebido / total) * 100)}%)` : `${mb} MB`;
      if (process.stdout.isTTY) process.stdout.write(`\r   Baixando… ${texto}   `);
    }
  });
  await pipeline(comProgresso, createWriteStream(destino));
  if (process.stdout.isTTY) process.stdout.write('\r');
  console.log(`   Download concluído: ${(recebido / 1e6).toFixed(0)} MB em ${segundos(inicio)}`);
  if (total && recebido !== total) throw new Error('O arquivo baixado está incompleto. Rode de novo.');
}

// Extrai o .zip. No Windows usamos o tar do próprio sistema (que entende zip);
// se não der, tentamos o Expand-Archive do PowerShell.
function extrair(zip, destino) {
  garantirPasta(destino);
  const tarWindows = process.env.SystemRoot && path.join(process.env.SystemRoot, 'System32', 'tar.exe');
  const tar = tarWindows && existsSync(tarWindows) ? tarWindows : process.platform === 'win32' ? null : 'tar';
  if (tar) {
    const r = spawnSync(tar, ['-xf', zip, '-C', destino], { stdio: 'inherit' });
    if (r.status === 0) return;
  }
  if (process.platform === 'win32') {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${destino}' -Force`], { stdio: 'inherit' });
    if (r.status === 0) return;
  } else {
    const r = spawnSync('unzip', ['-o', zip, '-d', destino], { stdio: 'inherit' });
    if (r.status === 0) return;
  }
  throw new Error(`Não consegui extrair ${zip}. Extraia manualmente para ${destino}.`);
}

export async function baixarBase(base = 'completa') {
  const cfg = montarConfig({ base });
  const ratings = path.join(cfg.dirBruto, 'ratings.csv');
  console.log(`\n📦 ${cfg.descricao}`);

  if (existsSync(ratings)) {
    console.log(`   Já está baixada em ${path.relative(process.cwd(), cfg.dirBruto)} (${(statSync(ratings).size / 1e6).toFixed(0)} MB de notas).`);
    console.log(LICENCA);
    return cfg;
  }

  garantirPasta(cfg.dirDados);
  const zip = path.join(cfg.dirDados, `${cfg.nomeBase}.zip`);
  if (!existsSync(zip)) await baixar(cfg.url, zip);
  else console.log('   Usando o .zip já baixado.');

  console.log('   Extraindo…');
  // O zip já contém uma pasta com o nome da base (ex.: ml-32m/)
  extrair(zip, path.dirname(cfg.dirBruto));
  if (!existsSync(ratings)) throw new Error(`Extração terminou, mas não achei ${ratings}.`);
  rmSync(zip); // o zip não é mais necessário

  console.log(`   ✅ Base pronta em ${path.relative(process.cwd(), cfg.dirBruto)}`);
  console.log(LICENCA);
  console.log('\n   Próximo passo: npm run mineracao' + (base === 'pequena' ? ' -- --base=pequena' : ''));
  return cfg;
}

// Executado direto pelo terminal
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('baixar.js')) {
  const { base = 'completa' } = lerArgumentos();
  baixarBase(base).catch((e) => {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  });
}
