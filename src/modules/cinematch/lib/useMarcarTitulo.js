import { useCallback } from 'react';
import { useToast } from '../../../shared/ui/Toast.jsx';
import { cmApi, dadosDoTitulo } from './api.js';

const MENSAGENS = {
  ja_vi: 'Marcado como "Já vi". Não vai mais aparecer nas recomendações.',
  quero_ver: 'Adicionado a "Quero ver" 🔖',
  nao_interessa: 'Entendido! Não vamos mais recomendar este título.',
};

// Hook usado pelos cards: salva Já vi / Quero ver / Não me interessa e avisa o usuário.
// `aoMarcar(titulo, status)` deixa a tela atualizar a lista (ex.: tirar o card do catálogo).
export function useMarcarTitulo(aoMarcar) {
  const toast = useToast();

  return useCallback(
    async (titulo, { status, nota = null, motivo = null }) => {
      try {
        if (status === null) {
          await cmApi.desmarcar(titulo.tipo, titulo.tmdb_id);
          toast('Removido da lista.');
        } else {
          const r = await cmApi.marcar({
            tmdb_id: titulo.tmdb_id,
            tipo: titulo.tipo,
            status,
            nota,
            motivo,
            dados: dadosDoTitulo(titulo),
          });
          toast(MENSAGENS[status]);
          if (r.perfil_atualizando) {
            setTimeout(() => toast('🧬 Suas últimas avaliações estão atualizando seu perfil de gosto.'), 600);
          }
        }
        aoMarcar?.(titulo, status, { nota, motivo });
        return true;
      } catch (e) {
        toast(e.message, 'erro');
        return false;
      }
    },
    [aoMarcar, toast]
  );
}
