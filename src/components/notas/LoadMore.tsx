interface LoadMoreProps {
  onLoadMore: () => void;
  loading: boolean;
}

export function LoadMore({ onLoadMore, loading }: LoadMoreProps) {
  return (
    <div className="flex justify-center py-8">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none"
        aria-label={loading ? "Cargando..." : "Cargar más notas"}
      >
        {loading ? "Cargando..." : "Cargar más"}
      </button>
    </div>
  );
}
