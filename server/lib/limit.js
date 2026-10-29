// Utilitários para controlar quantas requisições rodam ao mesmo tempo.
// Sem isso, importar um histórico com 500 títulos dispararia 500 chamadas de uma vez
// e o TMDB bloquearia (erro 429).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cria um "limitador": no máximo `max` funções rodando em paralelo; as outras esperam na fila.
export function createLimiter(max) {
  let ativos = 0;
  const fila = [];

  const proximo = () => {
    if (ativos >= max || fila.length === 0) return;
    ativos++;
    const { fn, resolve, reject } = fila.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        ativos--;
        proximo();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      fila.push({ fn, resolve, reject });
      proximo();
    });
}

// Aplica `fn` em cada item com paralelismo limitado, mantendo a ordem do resultado.
// Erros individuais viram `null` (um título com problema não derruba a lista inteira).
export async function mapLimit(itens, max, fn) {
  const limit = createLimiter(max);
  return Promise.all(
    itens.map((item, i) =>
      limit(() => fn(item, i)).catch((e) => {
        console.warn('[mapLimit] item falhou:', e.message);
        return null;
      })
    )
  );
}
