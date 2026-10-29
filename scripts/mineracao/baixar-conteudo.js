// Baixa os dados de CONTEÚDO usados para misturar "o que o filme é" com "quem gostou dele":
//   --fonte=genome  Tag Genome do MovieLens 25M (relevância de ~1.100 tags por filme). ~250 MB de download;
//                   só genome-scores.csv, genome-tags.csv e links.csv são extraídos.
//   --fonte=tmdb    Palavras-chave, direção, elenco, gêneros e coleção dos filmes da mineração, via API do TMDB
//                   (precisa do TMDB_READ_TOKEN: rode com  node --env-file=server/.env ...). Pode ser retomado.
// O tags.csv da base 32M já vem no download principal (npm run mineracao:baixar).
//
// Uso: npm run mineracao:conteudo  (as duas fontes)

import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { lerArgumentos, montarConfig } from './config.js';
import { garantirPasta, lerJson, segundos } from './util.js';

const URL_25M = 'https://files.grouplens.org/datasets/movielens/ml-25m.zip';
const ARQUIVOS_GENOME = ['ml-25m/genome-scores.csv', 'ml-25m/genome-tags.csv', 'ml-25m/links.csv'];

export async function baixarGenome(cfg) {
  const destino = path.join(cfg.dirDados, 'bruto', 'ml-25m');
  if (ARQUIVOS_GENOME.every((a) => existsSync(path.join(cfg.dirDados, 'bruto', a)))) {
    console.log('   Genome já está em', path.relative(process.cwd(), destino));
    return destino;
  }
  garantirPasta(cfg.dirDados);
  const zip = path.join(cfg.dirDados, 'ml-25m.zip');
  if (!existsSync(zip)) {
    console.log('   Baixando ml-25m.zip (só para o Tag Genome)…');
    const inicio = Date.now();
    const res = await fetch(URL_25M);
    if (!res.ok) throw new Error(`Download falhou (HTTP ${res.status})`);
    const total = Number(res.headers.get('content-length')) || 0;
    let recebido = 0;
    const corpo = Readable.fromWeb(res.body).on('data', (p) => (recebido += p.length));
    await pipeline(corpo, createWriteStream(zip));
    if (total && recebido !== total) throw new Error('Download incompleto. Rode de novo.');
    console.log(`   ${(recebido / 1e6).toFixed(0)} MB em ${segundos(inicio)}`);
  }
  const tar = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
  const r = spawnSync(existsSync(tar) ? tar : 'tar', ['-xf', zip, '-C', path.join(cfg.dirDados, 'bruto'), ...ARQUIVOS_GENOME], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Não consegui extrair os arquivos do genome.');
  rmSync(zip);
  console.log('   ✅ Genome pronto em', path.relative(process.cwd(), destino));
  return destino;
}

// ---------- TMDB ----------

export async function baixarTmdb(cfg) {
  const token = process.env.TMDB_READ_TOKEN;
  if (!token) throw new Error('Falta TMDB_READ_TOKEN. Rode com: node --env-file=server/.env scripts/mineracao/baixar-conteudo.js --fonte=tmdb');
  const itens = lerJson(cfg.dirProcessado, 'etapa2-itens.json');
  const arquivo = path.join(cfg.dirDados, 'processado', 'tmdb-metadados.json');
  const dados = existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {};
  const faltam = [...new Set(itens.map((f) => f.tmdb))].filter((id) => !(id in dados));
  console.log(`   TMDB: ${Object.keys(dados).length} já baixados, faltam ${faltam.length}`);
  const inicio = Date.now();
  let feitos = 0;
  const salvar = () => writeFileSync(arquivo, JSON.stringify(dados));

  async function um(id) {
    for (let t = 0; t < 5; t++) {
      const res = await fetch(`https://api.themoviedb.org/3/movie/${id}?append_to_response=keywords,credits`, {
        headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      }).catch(() => null);
      if (res?.status === 429 || !res) {
        await new Promise((r) => setTimeout(r, 1000 * (t + 1)));
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`TMDB ${res.status} no filme ${id}`);
      const d = await res.json();
      return {
        kw: (d.keywords?.keywords || []).map((k) => [k.id, k.name]),
        dir: (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name),
        cast: (d.credits?.cast || []).slice(0, 5).map((c) => c.name),
        gen: (d.genres || []).map((g) => g.id),
        col: d.belongs_to_collection?.id || null,
        ano: d.release_date ? Number(d.release_date.slice(0, 4)) : null,
      };
    }
    throw new Error(`TMDB não respondeu para o filme ${id}`);
  }

  const fila = [...faltam];
  const trabalhador = async () => {
    while (fila.length) {
      const id = fila.shift();
      dados[id] = await um(id);
      feitos++;
      if (feitos % 250 === 0) {
        salvar();
        console.log(`   ${feitos}/${faltam.length} (${segundos(inicio)})`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, trabalhador));
  salvar();
  console.log(`   ✅ Metadados do TMDB: ${Object.keys(dados).length} filmes em ${segundos(inicio)}`);
  return arquivo;
}

if (process.argv[1]?.endsWith('baixar-conteudo.js')) {
  const { fonte = 'todas', base = 'completa' } = lerArgumentos();
  const cfg = montarConfig({ base });
  (async () => {
    if (fonte === 'todas' || fonte === 'genome') await baixarGenome(cfg);
    if (fonte === 'todas' || fonte === 'tmdb') await baixarTmdb(cfg);
  })().catch((e) => {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  });
}
