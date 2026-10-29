// ETAPA 1 DO KDD: SELEÇÃO
// Escolhe, da base bruta, só o que interessa ao CineMatch:
//   - links.csv  -> liga cada filme do MovieLens ao ID do TMDB (o mesmo que o app usa)
//   - movies.csv -> título, ano e gêneros
// Filmes sem ID do TMDB são descartados: o app não teria como reconhecê-los.

import path from 'node:path';
import { lerLinhas, salvarJson, separarCsv } from './util.js';

// "Matrix, The" -> "The Matrix" (o MovieLens joga o artigo para o fim)
// Também funciona com título alternativo: "Professional, The (Le professionnel)" -> "The Professional (Le professionnel)"
export function arrumarTitulo(titulo) {
  const m = titulo.match(/^(.*?), (The|A|An|Les|La|Le|L'|Il|El|Los|Las|Der|Die|Das|O|Os|As)((?: \(.*\))?)$/);
  return m ? `${m[2]}${m[2].endsWith("'") ? '' : ' '}${m[1]}${m[3]}` : titulo;
}

export async function etapa1Selecao(cfg) {
  const links = new Map();
  await lerLinhas(path.join(cfg.dirBruto, 'links.csv'), (linha) => {
    const [movieId, , tmdbId] = linha.split(',');
    if (tmdbId) links.set(Number(movieId), Number(tmdbId));
  });

  const filmes = {};
  let noCatalogo = 0;
  await lerLinhas(path.join(cfg.dirBruto, 'movies.csv'), (linha) => {
    noCatalogo++;
    const [movieId, tituloBruto, generos] = separarCsv(linha);
    const tmdb = links.get(Number(movieId));
    if (!tmdb) return;
    const ano = tituloBruto.match(/\((\d{4})\)\s*$/)?.[1];
    filmes[movieId] = {
      tmdb,
      titulo: arrumarTitulo(tituloBruto.replace(/\s*\(\d{4}(?:[–-]\d{0,4})?\)\s*$/, '').trim()),
      ano: ano ? Number(ano) : null,
      generos: !generos || generos === '(no genres listed)' ? [] : generos.split('|'),
    };
  });

  const estatisticas = {
    filmes_no_catalogo: noCatalogo,
    filmes_com_tmdb: Object.keys(filmes).length,
    filmes_sem_tmdb: noCatalogo - Object.keys(filmes).length,
  };
  console.log(`   ${estatisticas.filmes_com_tmdb.toLocaleString('pt-BR')} de ${noCatalogo.toLocaleString('pt-BR')} filmes têm ID do TMDB`);

  salvarJson(cfg.dirProcessado, 'etapa1-filmes.json', filmes);
  salvarJson(cfg.dirProcessado, 'etapa1-estatisticas.json', estatisticas);
  return estatisticas;
}
