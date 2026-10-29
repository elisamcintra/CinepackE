// Ferramentas usadas por todas as etapas da mineração
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// Lê um arquivo grande linha por linha, sem carregar tudo na memória (streaming).
// `aoLer(linha, numero)` é chamado para cada linha (o cabeçalho é pulado).
export async function lerLinhas(arquivo, aoLer, { rotulo, pularCabecalho = true } = {}) {
  if (!existsSync(arquivo)) throw new Error(`Arquivo não encontrado: ${arquivo}\nRode antes: npm run mineracao:baixar`);
  const leitor = readline.createInterface({ input: createReadStream(arquivo, { highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  const progresso = rotulo ? criarProgresso(rotulo) : null;
  let n = 0;
  for await (const linha of leitor) {
    n++;
    if (pularCabecalho && n === 1) continue;
    if (!linha) continue;
    aoLer(linha, n - 1);
    if (progresso && n % 500000 === 0) progresso(n);
  }
  progresso?.fim(n - (pularCabecalho ? 1 : 0));
  return n - (pularCabecalho ? 1 : 0);
}

// Divide uma linha de CSV respeitando campos entre aspas (ex.: títulos com vírgula)
export function separarCsv(linha) {
  if (!linha.includes('"')) return linha.split(',');
  const campos = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') {
      campos.push(atual);
      atual = '';
    } else atual += c;
  }
  campos.push(atual);
  return campos;
}

// Mostra "Lendo notas… 12.500.000 linhas" no terminal
export function criarProgresso(rotulo) {
  const inicio = Date.now();
  const mostrar = (n) => process.stdout.isTTY && process.stdout.write(`\r   ${rotulo}… ${n.toLocaleString('pt-BR')} linhas`);
  mostrar.fim = (n) => {
    if (process.stdout.isTTY) process.stdout.write('\r');
    console.log(`   ${rotulo}: ${n.toLocaleString('pt-BR')} linhas em ${segundos(inicio)}`);
  };
  return mostrar;
}

export function segundos(inicio) {
  const s = (Date.now() - inicio) / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}min ${Math.round(s % 60)}s` : `${s.toFixed(1)}s`;
}

export function garantirPasta(dir) {
  mkdirSync(dir, { recursive: true });
}

export function salvarJson(dir, nome, dados) {
  garantirPasta(dir);
  writeFileSync(path.join(dir, nome), JSON.stringify(dados));
}

export function lerJson(dir, nome) {
  const arquivo = path.join(dir, nome);
  if (!existsSync(arquivo)) throw new Error(`Falta ${nome}. Rode as etapas anteriores primeiro (npm run mineracao).`);
  return JSON.parse(readFileSync(arquivo, 'utf8'));
}

// Salva/lê vetores numéricos (typed arrays) em arquivos binários: muito mais leve que JSON
export function salvarBinario(dir, nome, typed) {
  garantirPasta(dir);
  writeFileSync(path.join(dir, nome), Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength));
}

export function lerBinario(dir, nome, Tipo) {
  const buf = readFileSync(path.join(dir, nome));
  // Copia para um ArrayBuffer alinhado (exigência dos typed arrays)
  const copia = new Uint8Array(buf.byteLength);
  copia.set(buf);
  return new Tipo(copia.buffer);
}

// Gerador de números aleatórios com semente (mulberry32): o mesmo resultado a cada execução
export function criarAleatorio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Vetor numérico que cresce sozinho (o maior userId/movieId não é conhecido de antemão)
export class VetorCrescente {
  constructor(Tipo, tamanho = 1024) {
    this.Tipo = Tipo;
    this.dados = new Tipo(tamanho);
  }
  garantir(i) {
    if (i < this.dados.length) return;
    let n = this.dados.length;
    while (n <= i) n *= 2;
    const novo = new this.Tipo(n);
    novo.set(this.dados);
    this.dados = novo;
  }
  get(i) {
    return i < this.dados.length ? this.dados[i] : 0;
  }
  set(i, v) {
    this.garantir(i);
    this.dados[i] = v;
  }
  somar(i, v) {
    this.garantir(i);
    this.dados[i] += v;
  }
}

export const formatar = (n) => (typeof n === 'number' ? n.toLocaleString('pt-BR') : String(n));
export const pct = (v, casas = 1) => `${(v * 100).toFixed(casas).replace('.', ',')}%`;

// Roda uma etapa com cabeçalho e cronômetro
export async function comCronometro(titulo, fn) {
  console.log(`\n▶ ${titulo}`);
  const inicio = Date.now();
  const r = await fn();
  console.log(`✔ ${titulo} concluída em ${segundos(inicio)}`);
  return r;
}
