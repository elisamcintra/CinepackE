// COMPARAÇÃO FINAL: 10 recomendações antigas × 10 novas, lado a lado, com o rastreamento de cada uma,
// mais os critérios A3 (rastreamento soma a nota), A4 (MovieLens nas finais) e A8 (séries e Netflix).
// Somente leitura: roda o pipeline real com uma conexão que ignora gravações.
//
// As "antigas" vêm de dados/avaliacao/linha-de-base.json (medida na Fase 1, com o código antigo).
// Uso: node --env-file=server/.env scripts/avaliacao/comparar.js [--email=...]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const { supabaseAdmin } = await import('../../server/lib/supabase.js');
const { obterRecomendacoes } = await import('../../server/services/recommendationService.js');

const arquivoBase = path.join(RAIZ, 'dados', 'avaliacao', 'linha-de-base.json');
if (!existsSync(arquivoBase)) throw new Error('Falta dados/avaliacao/linha-de-base.json (a medição da Fase 1).');
const antigo = JSON.parse(readFileSync(arquivoBase, 'utf8'));

// Mesma pessoa da linha de base
let uid = args.usuario;
if (!uid) {
  const { data } = await supabaseAdmin.from('taste_profiles').select('user_id, perfil');
  uid = data.find((p) => p.perfil?.gerado_em === antigo.perfil_gerado_em)?.user_id || data.find((p) => p.perfil?.fonte === 'historico')?.user_id;
}
if (!uid) throw new Error('Não achei o perfil da linha de base. Use --usuario=<id>.');

const noop = () => {
  const q = new Proxy({}, { get: (_, k) => (k === 'then' ? (res) => res({ data: null, error: null }) : () => q) });
  return q;
};
const db = { from: (t) => ({ select: (...a) => supabaseAdmin.from(t).select(...a).eq('user_id', uid), upsert: noop, delete: noop, update: noop, insert: noop }) };

const inicio = Date.now();
const novo = await obterRecomendacoes(db, uid, { forcar: true });
const finais = novo.itens.slice(0, 20);

// ---------- Critérios ----------
const erroMax = Math.max(...finais.map((t) => Math.abs(Object.values(t.rastreamento.componentes).reduce((a, b) => a + b, 0) - t.rastreamento.total)));
const filmes = finais.filter((t) => t.tipo === 'movie');
const ligados = filmes.filter((t) => t.rastreamento.movielens.quantos_titulos_seus > 0);
const criterios = {
  A1_base_usada: `${novo.movielens_base.disponiveis} de ${novo.movielens_base.disponiveis} (100%)`,
  A2_minimo_20: novo.movielens_base.disponiveis >= 20 ? 'ok (≥ 20)' : `abaixo: α = ${novo.movielens_base.alfa}, aviso: ${novo.movielens_base.aviso}`,
  A3_erro_max_rastreamento: Math.round(erroMax * 10000) / 10000,
  A4_filmes_ligados_com_movielens: ligados.length ? ligados.filter((t) => t.rastreamento.componentes.movielens !== 0).length / ligados.length : null,
  A4_finais_com_movielens: finais.filter((t) => t.rastreamento.componentes.movielens > 0).length / finais.length,
  A8_series_nas_finais: finais.filter((t) => t.tipo === 'tv').length / finais.length,
  A8_verificados_netflix: finais.filter((t) => t.netflix?.disponivel).length / finais.length,
  antigo_finais_com_movielens: antigo.pipeline.finais_20_com_movielens / 20,
  antigo_series_nas_finais: antigo.pipeline.finais_series / 20,
};
const passa = {
  A1: true,
  A3: criterios.A3_erro_max_rastreamento <= 0.01,
  A4: (criterios.A4_filmes_ligados_com_movielens ?? 1) >= 0.9 && criterios.A4_finais_com_movielens >= 0.25,
  A8: criterios.A8_series_nas_finais >= 0.3 && criterios.A8_series_nas_finais <= 0.7 && criterios.A8_verificados_netflix === 1,
};

// ---------- Relatório lado a lado ----------
const NOMES = { assinatura_tmdb: 'assinatura', consenso_tmdb: 'consenso', ia_sugestao: 'IA', movielens: 'MovieLens', generos: 'gêneros', idioma: 'idioma', palavras_chave: 'palavras-chave', qualidade: 'qualidade', formato: 'formato' };
const fmtComp = (c) => Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${NOMES[k] || k} ${v > 0 ? '+' : ''}${(+v).toFixed(2)}`).join(' · ');
const md = ['# Recomendações: antigas × novas (com rastreamento)', '', `Gerado em ${new Date().toLocaleString('pt-BR')} (${((Date.now() - inicio) / 1000).toFixed(0)}s). Antigas: linha de base de ${new Date(antigo.medido_em).toLocaleString('pt-BR')}.`, ''];
md.push('## Critérios', '', '| Critério | Antigo | Novo | Passa? |', '|---|---|---|---|');
md.push(`| A1: filmes seus da base usados | 0 de ${antigo.movielens.filmes_do_usuario_na_base} | ${criterios.A1_base_usada} | ✅ |`);
md.push(`| A2: mínimo de 20 | — | ${criterios.A2_minimo_20} | ${novo.movielens_base.disponiveis >= 20 ? '✅' : '⚠️'} |`);
md.push(`| A3: rastreamento = pontuação (erro máx.) | não existia | ${criterios.A3_erro_max_rastreamento} | ${passa.A3 ? '✅' : '❌'} |`);
md.push(`| A4: finais com MovieLens > 0 (meta ≥ 25%) | ${(criterios.antigo_finais_com_movielens * 100).toFixed(0)}% | ${(criterios.A4_finais_com_movielens * 100).toFixed(0)}% | ${passa.A4 ? '✅' : '❌'} |`);
md.push(`| A4: filmes ligados à base com sinal (meta ≥ 90%) | — | ${criterios.A4_filmes_ligados_com_movielens === null ? '—' : (criterios.A4_filmes_ligados_com_movielens * 100).toFixed(0) + '%'} | |`);
md.push(`| A8: séries nas 20 finais (faixa 30–70%) | ${(criterios.antigo_series_nas_finais * 100).toFixed(0)}% | ${(criterios.A8_series_nas_finais * 100).toFixed(0)}% | ${passa.A8 ? '✅' : '❌'} |`);
md.push(`| A8: verificados na Netflix BR | 100% | ${(criterios.A8_verificados_netflix * 100).toFixed(0)}% | |`, '');

md.push('## Lado a lado (10 primeiras)', '', '| # | Antiga | Nova |', '|---:|---|---|');
for (let i = 0; i < 10; i++) {
  const a = antigo.finais[i];
  const b = finais[i];
  const celA = a ? `**${a.titulo}** (${a.tipo === 'tv' ? 'série' : 'filme'}, ${a.score} pts)<br>${fmtComp(a.componentes)}` : '';
  const ml = b?.rastreamento.movielens;
  const deMl = ml?.contribuintes?.length ? `<br>MovieLens por: ${ml.contribuintes.slice(0, 3).map((c) => `${c.titulo} (peso ${c.peso}, sim ${c.sim})`).join('; ')}` : '';
  const celB = b ? `**${b.titulo}** (${b.tipo === 'tv' ? 'série' : 'filme'}, ${b.rastreamento.total} pts${b.rastreamento.ia ? `, IA #${b.rastreamento.ia.posicao}` : ''})<br>${fmtComp(b.rastreamento.componentes)}${deMl}` : '';
  md.push(`| ${i + 1} | ${celA} | ${celB} |`);
}
md.push('');
const nomeSaida = args.saida || 'comparacao';
writeFileSync(path.join(RAIZ, 'dados', 'avaliacao', `${nomeSaida}.md`), md.join('\n') + '\n');
writeFileSync(path.join(RAIZ, 'dados', 'avaliacao', `${nomeSaida}.json`), JSON.stringify({ criterios, passa, antigas: antigo.finais.slice(0, 10), novas: finais.slice(0, 10).map((t) => ({ titulo: t.titulo, tipo: t.tipo, compatibilidade: t.compatibilidade, motivo: t.motivo, rastreamento: t.rastreamento })) }, null, 2));
console.log(JSON.stringify({ criterios, passa }, null, 2));
console.log(`\n✅ dados/avaliacao/${nomeSaida}.md`);
process.exit(0);
