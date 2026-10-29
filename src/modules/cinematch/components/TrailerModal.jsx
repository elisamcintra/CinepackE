import Modal from '../../../shared/ui/Modal.jsx';

// Trailer do YouTube (chave vinda do /videos do TMDB) em um modal
export default function TrailerModal({ videoKey, titulo, onFechar }) {
  return (
    <Modal aberto={!!videoKey} onFechar={onFechar} titulo={`Trailer: ${titulo}`} largura="max-w-4xl" semPadding>
      <div className="aspect-video w-full bg-black">
        {videoKey && (
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0`}
            title={`Trailer de ${titulo}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        )}
      </div>
    </Modal>
  );
}
