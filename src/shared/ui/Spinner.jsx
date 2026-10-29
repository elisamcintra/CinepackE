export default function Spinner({ className = 'h-8 w-8', label = 'Carregando' }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block animate-spin rounded-full border-2 border-cine-border border-t-cine-accent ${className}`}
    />
  );
}
