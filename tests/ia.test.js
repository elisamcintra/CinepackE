// Testes do serviço de IA: leitura segura do JSON, novas tentativas e plano B
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.AI_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'teste';
process.env.GROQ_API_KEY = 'teste-groq';
process.env.IA_ESPERA_MS = '1';
process.env.GEMINI_MODEL = 'modelo-principal';
process.env.GEMINI_MODELOS_RESERVA = 'modelo-reserva';

// Fila de respostas simuladas: cada item é { status, texto } para o Gemini; o Groq responde `groq`
let filaGemini = [];
let groq = null;
const chamadas = [];
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  const host = u.hostname;
  chamadas.push(host === 'api.groq.com' ? 'groq' : u.pathname.match(/models\/([^:]+)/)[1]);
  if (host === 'api.groq.com') {
    if (!groq) return { ok: false, status: 503, json: async () => ({ error: { message: 'fora do ar' } }) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: groq } }] }) };
  }
  const r = filaGemini.shift() || { status: 200, texto: '{}' };
  if (r.status !== 200) return { ok: false, status: r.status, json: async () => ({ error: { message: `erro ${r.status}` } }) };
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: r.texto }] } }] }) };
};
const geminiResponde = (...respostas) => (filaGemini = respostas.map((r) => (typeof r === 'number' ? { status: r } : { status: 200, texto: JSON.stringify(r) })));

const ia = await import('../server/services/aiService.js');

test('parseJsonSeguro lê JSON com ``` ou com texto em volta', () => {
  assert.deepEqual(ia.parseJsonSeguro('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(ia.parseJsonSeguro('Claro! {"a":2} Espero ter ajudado.'), { a: 2 });
  assert.equal(ia.parseJsonSeguro('não é json'), null);
});

test('ranking descarta ID inventado, repetido e motivo vazio; limita compatibilidade', async () => {
  geminiResponde({
    itens: [
      { id: 'movie:2', compatibilidade: 140, motivo: 'Bom.' },
      { id: 'movie:999', motivo: 'inventado' },
      { id: 'movie:2', motivo: 'repetido' },
      { id: 'tv:4', motivo: '  ' },
    ],
  });
  const r = await ia.iaRanquear({ perfil: {}, candidatos: [{ id: 'movie:2' }, { id: 'tv:4' }] });
  assert.equal(r.length, 1);
  assert.equal(r[0].compatibilidade, 100);
});

test('Gemini sobrecarregado (503) uma vez: tenta de novo e funciona', async () => {
  geminiResponde(503, { resumo: 'O público elogia a atmosfera.' });
  const r = await ia.iaResumirResenhas({ titulo: 'X', resenhas: [{ texto: 'great', nota: 8 }] });
  assert.equal(r, 'O público elogia a atmosfera.');
});

test('modelo principal sobrecarregado: passa para o modelo de reserva', async () => {
  geminiResponde(503, 503, { resumo: 'Resumo pelo modelo reserva.' });
  chamadas.length = 0;
  const r = await ia.iaResumirResenhas({ titulo: 'X', resenhas: [{ texto: 'ok', nota: 7 }] });
  assert.equal(r, 'Resumo pelo modelo reserva.');
  assert.deepEqual(chamadas, ['modelo-principal', 'modelo-principal', 'modelo-reserva']);
});

test('Gemini todo fora do ar: usa o Groq de reserva', async () => {
  geminiResponde(503, 503, 503, 503);
  groq = JSON.stringify({ resumo: 'Resumo pelo Groq.' });
  chamadas.length = 0;
  const r = await ia.iaResumirResenhas({ titulo: 'X', resenhas: [{ texto: 'ok', nota: 7 }] });
  assert.equal(r, 'Resumo pelo Groq.');
  assert.deepEqual(chamadas, ['modelo-principal', 'modelo-principal', 'modelo-reserva', 'modelo-reserva', 'groq']);
  groq = null;
});

test('tudo fora do ar: devolve null para o app usar o plano B (regras)', async () => {
  geminiResponde(429, 429, 429, 429);
  assert.equal(await ia.iaRanquear({ perfil: {}, candidatos: [{ id: 'movie:2' }] }), null);
});

test('modelo indisponível (404) não insiste: vai direto para o próximo', async () => {
  geminiResponde(404, { sugestoes: [] });
  chamadas.length = 0;
  await ia.iaSugerirTitulos({ perfil: {}, amados: [], rejeitados: [], jaVistos: [] });
  assert.deepEqual(chamadas, ['modelo-principal', 'modelo-reserva']);
});

test('sem resenhas, a IA nem é chamada (nunca inventa opiniões)', async () => {
  chamadas.length = 0;
  assert.equal(await ia.iaResumirResenhas({ titulo: 'X', resenhas: [] }), null);
  assert.equal(chamadas.length, 0);
});

test('sugestões: valida tipo e limita campos', async () => {
  geminiResponde({ sugestoes: [{ titulo_original: 'Dark', ano: 2017, tipo: 'tv' }, { titulo: 'X', tipo: 'livro' }] });
  const s = await ia.iaSugerirTitulos({ perfil: {}, amados: [], rejeitados: [], jaVistos: [] });
  assert.equal(s.length, 1);
  assert.equal(s[0].titulo, 'Dark');
});
