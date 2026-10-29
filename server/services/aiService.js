// IA embutida do CineMatch: roda SOMENTE aqui no servidor.
//
// Provedores gratuitos suportados (escolha em AI_PROVIDER no server/.env):
//   - gemini: Google AI Studio (padrão)
//   - groq:   Groq Cloud (API compatível com OpenAI)
//   - none:   desliga a IA; o app usa as regras simples (fallback)
//
// Regras importantes:
//   - A IA sempre responde em JSON, que é validado antes de usar.
//   - A IA NUNCA inventa títulos, notas ou disponibilidade: ela só escolhe/explica
//     itens que o servidor já buscou no TMDB e verificou na Netflix.
//   - Se a chamada falhar, cada função devolve `null` e quem chamou usa o fallback.

import { config, iaConfigurada } from '../lib/config.js';
import { CHAVES_GENERO, nomeGenero } from '../lib/genres.js';
import { IDIOMAS } from '../lib/languages.js';

export function iaDisponivel() {
  return config.ai.provider !== 'none' && iaConfigurada();
}

// ---------- Chamada genérica ----------

async function chamarGemini({ sistema, prompt, temperatura, maxTokens, modelo }) {
  const { geminiApiKey } = config.ai;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: temperatura,
        maxOutputTokens: maxTokens,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw erroIA('Gemini', res.status, data.error?.message);
  const partes = data.candidates?.[0]?.content?.parts || [];
  return partes.map((p) => p.text || '').join('');
}

async function chamarGroq({ sistema, prompt, temperatura, maxTokens }) {
  const { groqApiKey, groqModel } = config.ai;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqApiKey}` },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: groqModel,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: temperatura,
      max_tokens: maxTokens,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw erroIA('Groq', res.status, data.error?.message);
  return data.choices?.[0]?.message?.content || '';
}

function erroIA(provedor, status, mensagem) {
  const e = new Error(`${provedor} ${status}: ${mensagem || 'erro desconhecido'}`);
  e.status = status;
  return e;
}

// 429 (limite por minuto), 500/503 (serviço sobrecarregado) e timeout costumam passar sozinhos
const temporario = (e) => e.name === 'TimeoutError' || [429, 500, 502, 503, 504].includes(e.status);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Ordem de tentativa: o provedor escolhido no .env (com os modelos de reserva do Gemini)
// e, se houver chave, o outro provedor como última reserva
function provedoresDisponiveis() {
  const { provider, geminiApiKey, groqApiKey, geminiModel, geminiReservas } = config.ai;
  const gemini = geminiApiKey
    ? [...new Set([geminiModel, ...geminiReservas])].map((modelo) => ({
        nome: `gemini (${modelo})`,
        grupo: 'gemini',
        chamar: (args) => chamarGemini({ ...args, modelo }),
      }))
    : [];
  const groq = groqApiKey ? [{ nome: 'groq', grupo: 'groq', chamar: chamarGroq }] : [];
  return provider === 'groq' ? [...groq, ...gemini] : [...gemini, ...groq];
}

// Lê JSON mesmo que venha cercado de ```json ... ``` ou com texto antes/depois
export function parseJsonSeguro(texto) {
  if (!texto) return null;
  let t = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const ini = t.indexOf('{');
    const fim = t.lastIndexOf('}');
    if (ini >= 0 && fim > ini) {
      try {
        return JSON.parse(t.slice(ini, fim + 1));
      } catch {
        /* cai no return null */
      }
    }
    return null;
  }
}

/**
 * Chama a IA e devolve o JSON da resposta (ou null para o app usar o plano B).
 * Ordem: modelo principal -> modelos de reserva do Gemini -> Groq (se houver chave).
 * Erros temporários (sobrecarga, limite por minuto) ganham 1 nova tentativa em cada modelo.
 */
const ESPERA_BASE = Number(process.env.IA_ESPERA_MS) || 1500; // os testes usam uma espera curtinha

export async function gerarJSON({ sistema, prompt, temperatura = 0.4, maxTokens = 8192, tarefa = 'ia', esperaBase = ESPERA_BASE }) {
  if (!iaDisponivel()) return null;
  for (const provedor of provedoresDisponiveis()) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const inicio = Date.now();
        const texto = await provedor.chamar({ sistema, prompt, temperatura, maxTokens });
        const json = parseJsonSeguro(texto);
        if (!json) {
          console.warn(`[ia:${tarefa}] ${provedor.nome}: resposta não era JSON válido`);
          break; // tentar de novo não costuma resolver; passa para o próximo provedor
        }
        console.log(`[ia:${tarefa}] ok via ${provedor.nome} em ${Date.now() - inicio}ms`);
        return json;
      } catch (e) {
        // Erro temporário: mais uma tentativa no mesmo modelo. Outros erros (ex.: 404, modelo
        // indisponível) pulam direto para o próximo modelo/provedor da lista.
        const deNovo = temporario(e) && tentativa === 0;
        console.warn(`[ia:${tarefa}] ${provedor.nome} falhou${deNovo ? ', tentando de novo' : ''}:`, e.message);
        if (!deNovo) break;
        await esperar(esperaBase);
      }
    }
  }
  console.warn(`[ia:${tarefa}] sem resposta da IA, usando o plano B (regras)`);
  return null;
}

const SISTEMA_BASE =
  'Você é o motor de recomendação do CineMatch, um app pessoal de filmes e séries da Netflix Brasil, ' +
  'e um curador de cinema experiente. Responda SEMPRE em JSON válido, sem texto fora do JSON. Escreva em ' +
  'português do Brasil, de forma calorosa e direta. Nunca invente dados, notas ou opiniões do público. ' +
  'Ao usar seu conhecimento sobre filmes e séries, só afirme o que tiver certeza.';

// ---------- 8.1 Perfil de gosto ----------

/**
 * entrada = { quiz: [{pergunta, respostas: [...], comentario}], historico: [...],
 *             avaliacoes: [...], perfilBase, ancorasPossiveis: [{id, titulo}] }
 */
export async function iaGerarPerfil(entrada) {
  const generos = CHAVES_GENERO.map((c) => `${c} (${nomeGenero(c)})`).join(', ');
  const prompt = `Monte o perfil de gosto deste usuário.

DADOS DO USUÁRIO (JSON):
${JSON.stringify(entrada, null, 1)}

Como interpretar:
- "quiz" mostra o que a pessoa DIZ gostar, com nuances e comentários livres (dê muito peso aos comentários e à pergunta 10).
- "historico" mostra o que ela REALMENTE assiste. peso > 0.7 = gosto forte; peso negativo = abandonou cedo.
- "avaliacoes" são notas que ela deu (1 a 5) e títulos que marcou como "não me interessa" (com motivo).
- "perfilBase" é um rascunho calculado por regras simples: corrija e refine.
- Se houver conflito (ex.: diz odiar romance mas o histórico tem vários romances europeus), registre a nuance
  em "generos_evitar[].nuance" e no "resumo" (ex.: "rejeita romance clichê, mas consome romance europeu").

Responda neste formato JSON exato:
{
  "resumo": "2 a 4 frases falando diretamente com a pessoa (você...), citando gostos e nuances",
  "generos_favoritos": [{"chave": "scifi", "peso": 0.9}],
  "generos_evitar": [{"chave": "romance", "nuance": "aceita se for europeu/realista", "forca": 0.6}],
  "palavras_chave_tmdb": ["time travel", "dystopia"],
  "idiomas_preferidos": ["es", "ko"],
  "tom": ["cerebral", "melancólico"],
  "evitar": ["violência gráfica", "susto barato"],
  "titulos_ancora": ["tv:70523"],
  "duracao_preferida": "filmes_curtos | filmes_ou_minisseries | qualquer | depende"
}

Regras:
- "chave" de gênero deve ser uma destas: ${generos}.
- "peso" e "forca" entre 0 e 1. Até 6 favoritos e até 5 a evitar.
- "palavras_chave_tmdb": até 8 termos EM INGLÊS, no estilo das keywords do TMDB.
- "idiomas_preferidos": códigos ISO 639-1 dentre: ${Object.keys(IDIOMAS).join(', ')}. Lista vazia se a pessoa não tiver preferência.
- "titulos_ancora": até 6 IDs escolhidos SOMENTE de "ancorasPossiveis".`;

  return gerarJSON({ sistema: SISTEMA_BASE, prompt, temperatura: 0.3, tarefa: 'perfil' });
}

// ---------- 8.2 Ranquear candidatos e explicar ----------

/**
 * candidatos: [{ id: 'movie:123', titulo, ano, tipo, generos, idioma, nota, sinopse, sinais... }]
 * Devolve [{ id, motivo, compatibilidade }] (só IDs que existem na lista) ou null.
 */
export async function iaRanquear({ perfil, candidatos, quantidade = 15, contexto = '' }) {
  if (!candidatos.length) return null;
  const prompt = `PERFIL DO USUÁRIO:
${JSON.stringify(resumoPerfilParaIA(perfil), null, 1)}
${contexto ? `\nPEDIDO/CONTEXTO ATUAL: ${contexto}\n` : ''}
CANDIDATOS (todos já verificados na Netflix Brasil):
${JSON.stringify(candidatos, null, 1)}

Os campos "sinais" de cada candidato foram calculados pelo app:
- "parecido_com": títulos que a pessoa amou e a partir dos quais este foi recomendado (quanto mais, melhor)
- "temas_em_comum": detalhes que ele compartilha com os favoritos da pessoa
- "alerta": detalhes que aparecem em títulos que ela rejeitou
- "nota_ajustada": nota do TMDB corrigida pelo número de votos

Escolha os ${quantidade} candidatos que mais combinam com a pessoa (ou todos, se houver menos), do melhor para o pior.
Use também o seu conhecimento sobre essas obras (tom, ritmo, estilo, recepção da crítica), mas não afirme fatos
de que não tenha certeza. Respeite as nuances do perfil (ex.: "evita romance clichê" não exclui um drama europeu
com romance). Prefira uma lista variada: não coloque só títulos do mesmo tipo ou da mesma franquia no topo.

Para cada um:
- "compatibilidade": de 0 a 100, o quanto você acha que a pessoa vai gostar (seja honesto: nem tudo é 95).
- "motivo": 1 a 2 frases, pessoais, ligando o título ao gosto dela de forma concreta.
  Exemplo: "Você disse que gosta de romance europeu realista: este é francês e foge totalmente do clichê."
  Não repita o mesmo início de frase. Não cite notas que não estejam nos dados.

Responda: {"itens": [{"id": "movie:123", "compatibilidade": 87, "motivo": "..."}]}
Use SOMENTE ids da lista de candidatos.`;

  const json = await gerarJSON({ sistema: SISTEMA_BASE, prompt, temperatura: 0.5, tarefa: 'ranking' });
  if (!Array.isArray(json?.itens)) return null;

  const validos = new Set(candidatos.map((c) => c.id));
  const vistos = new Set();
  const itens = json.itens
    .filter((i) => {
      if (!i || !validos.has(i.id) || vistos.has(i.id)) return false;
      vistos.add(i.id);
      return typeof i.motivo === 'string' && i.motivo.trim();
    })
    .map((i) => {
      const c = Number(i.compatibilidade);
      return { ...i, compatibilidade: Number.isFinite(c) ? Math.max(0, Math.min(100, Math.round(c))) : null };
    });
  return itens.length ? itens : null;
}

// ---------- Sugestões a partir do conhecimento da IA ----------

/**
 * A IA conhece muitos filmes e séries. Pedimos sugestões pelo NOME; o servidor depois
 * procura cada uma no TMDB e confere na Netflix BR. O que não existir ou não estiver
 * na Netflix é descartado, então a IA nunca "inventa" o que aparece no catálogo.
 * Devolve [{ titulo, titulo_original, ano, tipo, por_que }] ou null.
 */
export async function iaSugerirTitulos({ perfil, amados, rejeitados, jaVistos, formato, quantidade = 30 }) {
  const prompt = `PERFIL DO USUÁRIO:
${JSON.stringify(resumoPerfilParaIA(perfil), null, 1)}

Títulos que a pessoa AMOU: ${amados.join('; ') || '(nenhum informado)'}
Títulos que ela NÃO gostou: ${rejeitados.join('; ') || '(nenhum)'}
Alguns que ela JÁ VIU (não sugira estes): ${jaVistos.join('; ') || '(nenhum)'}
Formato preferido: ${formato || 'qualquer'}

Sugira ${quantidade} filmes e séries que esta pessoa provavelmente vai AMAR, pensando como um curador de cinema
que conhece bem o gosto dela. Regras:
- Prefira títulos que costumam estar no catálogo da Netflix no Brasil (produções originais Netflix e títulos licenciados).
- Misture apostas certeiras com algumas joias menos conhecidas; não fique só nos mais populares.
- Respeite o formato preferido (ex.: "filmes_curtos" = só filmes de até ~2h).
- Varie países, décadas e estilos dentro do que combina com ela.
- Use o nome ORIGINAL exato e o ano de lançamento, para que o título possa ser encontrado no TMDB.

Responda: {"sugestoes": [{"titulo_original": "Dark", "titulo": "Dark", "ano": 2017, "tipo": "tv", "por_que": "frase curta"}]}
"tipo" é "movie" (filme) ou "tv" (série).`;

  const json = await gerarJSON({ sistema: SISTEMA_BASE, prompt, temperatura: 0.7, tarefa: 'sugestoes' });
  if (!Array.isArray(json?.sugestoes)) return null;
  return json.sugestoes
    .filter((s) => s && (typeof s.titulo_original === 'string' || typeof s.titulo === 'string') && ['movie', 'tv'].includes(s.tipo))
    .slice(0, quantidade)
    .map((s) => ({
      titulo: String(s.titulo || s.titulo_original).slice(0, 200),
      titulo_original: String(s.titulo_original || s.titulo).slice(0, 200),
      ano: Number(s.ano) || null,
      tipo: s.tipo,
      por_que: typeof s.por_que === 'string' ? s.por_que.slice(0, 200) : null,
    }));
}

// ---------- Tradução de temas (palavras-chave do TMDB vêm em inglês) ----------

export async function iaTraduzirTermos(termos) {
  if (!termos.length) return null;
  const prompt = `Traduza para o português do Brasil estes temas/palavras-chave de filmes (do TMDB), de forma curta e natural,
como apareceriam numa descrição de filme (ex.: "time travel" -> "viagem no tempo", "small town" -> "cidade pequena"):
${JSON.stringify(termos)}

Responda: {"traducoes": {"termo em inglês": "tradução"}}`;
  const json = await gerarJSON({ sistema: SISTEMA_BASE, prompt, temperatura: 0, maxTokens: 4096, tarefa: 'traducao' });
  const t = json?.traducoes;
  if (!t || typeof t !== 'object') return null;
  return Object.fromEntries(Object.entries(t).filter(([k, v]) => termos.includes(k) && typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim().slice(0, 60)]));
}

// ---------- 8.3 Resumir opiniões reais ----------

export async function iaResumirResenhas({ titulo, resenhas }) {
  if (!resenhas.length) return null;
  const textos = resenhas.slice(0, 8).map((r) => ({
    nota: r.nota,
    texto: r.texto.slice(0, 1500),
  }));
  const prompt = `Resenhas REAIS de usuários do TMDB sobre "${titulo}" (podem estar em inglês):
${JSON.stringify(textos, null, 1)}

Resuma em português, em 2 a 3 frases, o que o público elogia e o que critica
(ex.: "O público elogia... e critica..."). Use apenas o que está nas resenhas. Não invente.
Se as opiniões forem divididas, diga isso.

Responda: {"resumo": "..."}`;

  const json = await gerarJSON({ sistema: SISTEMA_BASE, prompt, temperatura: 0.2, maxTokens: 2048, tarefa: 'resenhas' });
  return typeof json?.resumo === 'string' && json.resumo.trim() ? json.resumo.trim() : null;
}

// ---------- 8.4 Interpretar busca em texto livre ----------

export async function iaInterpretarBusca({ texto, perfil }) {
  const generos = CHAVES_GENERO.map((c) => `${c} (${nomeGenero(c)})`).join(', ');
  const prompt = `O usuário escreveu este pedido de busca: "${texto}"
${perfil ? `\nPerfil dele (para contexto): ${perfil.resumo || ''}\n` : ''}
Converta o pedido em parâmetros de busca. Responda neste JSON exato (use null ou [] quando não se aplicar):
{
  "tipo": "movie | tv | ambos",
  "generos": ["chave"],
  "excluir_generos": ["chave"],
  "palavras_chave_tmdb": ["termos em inglês, estilo keywords do TMDB"],
  "titulos_referencia": ["nomes de filmes/séries citados como referência, ex.: Dark"],
  "duracao_max_min": null,
  "ano_min": null,
  "ano_max": null,
  "idiomas": ["códigos ISO 639-1"],
  "clima": "leve | intenso | pensar | rir | chorar | null",
  "explicacao": "1 frase em português dizendo o que você entendeu do pedido"
}
Chaves de gênero válidas: ${generos}.
Exemplos: "algo tipo Dark, mas menos confuso" -> titulos_referencia ["Dark"], generos ["scifi","misterio"], clima "pensar".
"comédia leve para ver com minha mãe" -> generos ["comedia","familia"], excluir_generos ["terror"], clima "leve".`;

  return gerarJSON({ sistema: SISTEMA_BASE, prompt, temperatura: 0.2, maxTokens: 2048, tarefa: 'busca' });
}

// Versão enxuta do perfil para economizar tokens nos prompts
function resumoPerfilParaIA(perfil) {
  if (!perfil) return {};
  return {
    resumo: perfil.resumo,
    gosta: (perfil.generos_favoritos || []).map((g) => `${g.nome} (${g.peso})`),
    evita: (perfil.generos_evitar || []).map((g) => `${g.nome}${g.nuance ? ` [${g.nuance}]` : ''}`),
    idiomas_preferidos: perfil.idiomas_preferidos,
    tom: perfil.tom,
    evitar: perfil.evitar,
    duracao_preferida: perfil.duracao_preferida,
    amou: (perfil.titulos_ancora || []).map((a) => a.titulo),
    temas_que_se_repetem_nos_favoritos: perfil.assinatura_resumo?.temas?.slice(0, 10).map((t) => t.texto),
    diretores_criadores_favoritos: perfil.assinatura_resumo?.pessoas?.slice(0, 5).map((p) => p.texto),
    temas_em_titulos_rejeitados: perfil.assinatura_resumo?.temas_evitados?.slice(0, 5),
  };
}
