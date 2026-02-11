"use client";

import ReactMarkdown from "react-markdown";

interface PostContentRendererProps {
  content: string;
}

/**
 * Renderiza Markdown de forma segura. react-markdown por defecto no interpreta
 * HTML crudo (solo Markdown); si en el futuro se permite HTML, usar rehype-sanitize
 * para evitar XSS.
 */
export function PostContentRenderer({ content }: PostContentRendererProps) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-4">{children}</p>,
        h2: ({ children }) => <h2 className="mt-8 mb-4 text-xl font-bold">{children}</h2>,
        h3: ({ children }) => <h3 className="mt-6 mb-3 text-lg font-semibold">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        a: ({ href, children }) => (
          <a href={href} className="text-primary underline hover:no-underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        img: ({ src, alt }) => (
          <span className="block my-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src ?? ""} alt={alt ?? ""} className="max-w-full h-auto rounded-lg" />
          </span>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
