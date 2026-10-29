// Erro com status HTTP e uma mensagem amigável (em português) para mostrar ao usuário.
export class HttpError extends Error {
  constructor(status, publicMessage, detalhe) {
    super(detalhe || publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

// Converte um valor de query string em número (ou undefined se vazio/inválido)
export function num(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const TIPOS_VALIDOS = ['movie', 'tv'];

export function validarTipo(tipo) {
  if (!TIPOS_VALIDOS.includes(tipo)) throw new HttpError(400, 'Tipo inválido (use movie ou tv).');
  return tipo;
}
