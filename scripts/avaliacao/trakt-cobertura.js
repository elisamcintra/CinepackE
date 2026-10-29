// Cobertura do Trakt para as séries de uma pessoa: quantas séries de peso alto têm lista de relacionadas,
// quantas relacionadas ela ainda não viu, quantas estão na Netflix BR e quanto isso acrescenta às recomendações
// do TMDB. Somente leitura nos dados da pessoa (usa o cache normal do app para Trakt e TMDB).
//
// Uso:
//   node --env-file=server/.env scripts/avaliacao/trakt-cobertura.js --email=pessoa@exemplo.com
//   node --env-file=server/.env scripts/avaliacao/trakt-cobertura.js --usuario=<início do id>
//   node --env-file=server/.env scripts/avaliacao/trakt-cobertura.js --arquivo=dados/avaliacao/series-x.json [--sem-notas]
//   (--sem-notas: usa só o peso do histórico, ignorando as notas guardadas no arquivo)
// Saída: dados/avaliacao/trakt-<id>.json e .md (fora do Git: contém os títulos da pessoa)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const { supabaseAdmin } = await import('../../server/lib/supabase.js');
const { config } = await import('../../server/lib/config.js');
const { semNome } = await import('../../src/modules/cinematch/lib/nomesHistorico.js');
const { relacionadasDasSeries, traktDisponivel } = await import('../../server/services/traktService.js');
const { recommendations } = await import('../../server/services/tmdbService.js');
const { mapLimit } = await import('../../server/lib/limit.js');

if (!traktDisponivel()) throw new Error('Falta TRAKT_CLIENT_ID no server/.env.');
const PESO_ALTO = 0.7;

// ---------- Séries da pessoa ----------
let rotulo;
let series; // [{ tmdb_id, titulo, peso }]
let vistas; // Set de tmdb_id de séries já vistas ou descartadas
if (args.arquivo) {
  const lista = JSON.parse(readFileSync(path.resolve(RAIZ, args.arquivo), 'utf8'));
  rotulo = path.basename(args.arquivo, '.json');
  // Mesma regra do modo banco: nota 4–5 = 1, nota 1–2 = −1, nota 3 = neutra; sem nota, vale o peso do histórico
  const pesoDaNota = (n) => (n >= 4 ? 1 : n <= 2 ? -1 : 0);
  series = lista.map((s) => ({ tmdb_id: s.tmdb_id, titulo: s.titulo, peso: !('sem-notas' in args) && s.nota ? pesoDaNota(s.nota) : s.peso }));
  vistas = new Set(lista.map((s) => s.tmdb_id));
} else {
  const usuarios = (await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })).data.users;
  const u = usuarios.find((x) => (args.email && x.email === args.email) || (args.usuario && x.id.startsWith(args.usuario)));
  if (!u) throw new Error('Pessoa não encontrada. Use --email=... ou --usuario=<início do id>.');
  rotulo = u.id.slice(0, 8);
  const ler = async (tabela, colunas) => {
    const out = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await supabaseAdmin.from(tabela).select(colunas).eq('user_id', u.id).range(i, i + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  };
  const hist = (await ler('watch_history_import', 'titulo_original, titulo_tmdb, tmdb_id, tipo, peso')).filter((h) => !semNome(h.titulo_original));
  const titulos = await ler('user_titles', 'tmdb_id, tipo, status, nota, dados');
  const porId = new Map();
  for (const h of hist) if (h.tipo === 'tv' && h.tmdb_id) porId.set(h.tmdb_id, { tmdb_id: h.tmdb_id, titulo: h.titulo_tmdb || h.titulo_original, peso: Math.max(porId.get(h.tmdb_id)?.peso ?? -1, h.peso) });
  // A nota dada no app vale mais que o peso calculado pelo histórico
  for (const t of titulos) {
    if (t.tipo !== 'tv' || !t.nota) continue;
    porId.set(t.tmdb_id, { tmdb_id: t.tmdb_id, titulo: t.dados?.titulo || porId.get(t.tmdb_id)?.titulo || '', peso: t.nota >= 4 ? 1 : t.nota <= 2 ? -1 : 0 });
  }
  series = [...porId.values()];
  vistas = new Set([...series.map((s) => s.tmdb_id), ...titulos.filter((t) => t.tipo === 'tv').map((t) => t.tmdb_id)]);
}
const alto = series.filter((s) => s.peso >= PESO_ALTO);
console.log(`[trakt] ${rotulo}: ${series.length} séries, ${alto.length} de peso alto (≥ ${PESO_ALTO})`);

// ---------- Trakt ----------
const inicio = Date.now();
const mapa = await relacionadasDasSeries(alto);
const tempoTrakt = (Date.now() - inicio) / 1000;
const porSerie = alto.map((s) => ({ ...s, r: mapa.get(Number(s.tmdb_id)) }));
const semTrakt = porSerie.filter((x) => !x.r);
const listaVazia = porSerie.filter((x) => x.r && !x.r.itens.length);
const comLista = porSerie.filter((x) => x.r?.itens.length);
const tamanhos = comLista.map((x) => x.r.itens.length).sort((a, b) => a - b);
const daTrakt = new Set();
for (const x of comLista) for (const i of x.r.itens) if (!vistas.has(i.tmdb_id)) daTrakt.add(i.tmdb_id);

// ---------- TMDB: recomendações (página 1) das mesmas séries, para comparar ----------
const recs = await mapLimit(alto, 6, (s) => recommendations('tv', s.tmdb_id));
const doTmdb = new Set();
recs.forEach((l) => (l || []).forEach((r) => !vistas.has(r.id) && doTmdb.add(r.id)));

// ---------- Netflix BR (uma consulta de provedores por série candidata, direto no TMDB) ----------
const uniao = [...new Set([...daTrakt, ...doTmdb])];
const naNetflix = new Set(
  (
    await mapLimit(uniao, 8, async (id) => {
      for (let t = 0; t < 4; t++) {
        const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/watch/providers`, { headers: { Authorization: `Bearer ${config.tmdbReadToken}` } });
        if (r.status === 429) {
          await new Promise((ok) => setTimeout(ok, 1000));
          continue;
        }
        const d = r.ok ? await r.json() : null;
        return (d?.results?.BR?.flatrate || []).some((p) => [8, 1796].includes(p.provider_id)) ? id : null;
      }
      return null;
    })
  ).filter(Boolean)
);
const nf = (set) => [...set].filter((id) => naNetflix.has(id)).length;
const so = (a, b) => [...a].filter((id) => !b.has(id) && naNetflix.has(id)).length;

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—');
const res = {
  pessoa: rotulo,
  medido_em: new Date().toISOString(),
  series_peso_alto: alto.length,
  com_lista: comLista.length,
  sem_serie_no_trakt: semTrakt.length,
  lista_vazia: listaVazia.length,
  relacionadas_por_serie: { minimo: tamanhos[0] ?? 0, mediana: tamanhos[Math.floor(tamanhos.length / 2)] ?? 0, maximo: tamanhos.at(-1) ?? 0 },
  relacionadas_sem_id_tmdb: comLista.reduce((a, x) => a + x.r.sem_tmdb, 0),
  trakt_unicas_nao_vistas: daTrakt.size,
  trakt_na_netflix_br: nf(daTrakt),
  tmdb_recs_unicas_nao_vistas: doTmdb.size,
  tmdb_recs_na_netflix_br: nf(doTmdb),
  so_trakt_na_netflix: so(daTrakt, doTmdb),
  so_tmdb_na_netflix: so(doTmdb, daTrakt),
  as_duas_na_netflix: [...daTrakt].filter((id) => doTmdb.has(id) && naNetflix.has(id)).length,
  chamadas_trakt_max: alto.length * 2,
  tempo_trakt_s: Math.round(tempoTrakt),
  sem_serie_no_trakt_titulos: semTrakt.map((x) => x.titulo),
  lista_vazia_titulos: listaVazia.map((x) => x.titulo),
};
const md = [
  `# Trakt: cobertura das séries de peso alto (${rotulo})`,
  '',
  `Medido em ${new Date().toLocaleString('pt-BR')}. Chamadas ao Trakt: até ${res.chamadas_trakt_max} (2 por série; ${res.tempo_trakt_s}s, com cache de 30 dias).`,
  '',
  '| | Quantidade |',
  '|---|---:|',
  `| Séries de peso alto | ${res.series_peso_alto} |`,
  `| **Com lista de relacionadas** | **${res.com_lista} (${pct(res.com_lista, res.series_peso_alto)})** |`,
  `| Lista vazia | ${res.lista_vazia} |`,
  `| Série não encontrada no Trakt pelo ID do TMDB | ${res.sem_serie_no_trakt} |`,
  `| Relacionadas por série (mín. / mediana / máx.) | ${res.relacionadas_por_serie.minimo} / ${res.relacionadas_por_serie.mediana} / ${res.relacionadas_por_serie.maximo} |`,
  `| Relacionadas descartadas por não ter ID do TMDB | ${res.relacionadas_sem_id_tmdb} |`,
  `| Trakt: relacionadas únicas não vistas / na Netflix BR | ${res.trakt_unicas_nao_vistas} / ${res.trakt_na_netflix_br} |`,
  `| TMDB (recomendações, pág. 1): únicas não vistas / na Netflix BR | ${res.tmdb_recs_unicas_nao_vistas} / ${res.tmdb_recs_na_netflix_br} |`,
  `| Na Netflix BR: só Trakt / só TMDB / nas duas | ${res.so_trakt_na_netflix} / ${res.so_tmdb_na_netflix} / ${res.as_duas_na_netflix} |`,
  '',
  res.sem_serie_no_trakt_titulos.length ? `Não encontradas no Trakt: ${res.sem_serie_no_trakt_titulos.join('; ')}` : '',
  res.lista_vazia_titulos.length ? `Lista vazia: ${res.lista_vazia_titulos.join('; ')}` : '',
];
const dir = path.join(RAIZ, 'dados', 'avaliacao');
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, `trakt-${rotulo}.json`), JSON.stringify(res, null, 2));
writeFileSync(path.join(dir, `trakt-${rotulo}.md`), md.join('\n') + '\n');
console.log(JSON.stringify(res, null, 2));
process.exit(0);
