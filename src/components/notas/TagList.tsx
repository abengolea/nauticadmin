interface TagListProps {
  tags: string[];
  size?: "sm" | "default";
}

export function TagList({ tags, size = "default" }: TagListProps) {
  if (!tags?.length) return null;

  return (
    <ul className="flex flex-wrap gap-1" aria-label="Etiquetas">
      {tags.map((tag) => (
        <li key={tag}>
          <span
            className={`inline-flex items-center rounded-md bg-muted px-2 font-medium text-muted-foreground ${
              size === "sm" ? "text-xs" : "text-sm"
            }`}
          >
            {tag}
          </span>
        </li>
      ))}
    </ul>
  );
}
