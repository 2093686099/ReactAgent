import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

type TextSegmentProps = {
  content: string;
  isStreaming?: boolean;
};

function TextSegmentInner({ content, isStreaming = false }: TextSegmentProps) {
  const rehypePlugins = isStreaming
    ? [rehypeSanitize]
    : [rehypeSanitize, rehypeHighlight];

  return (
    <div className="text-[15px] leading-6 text-[var(--color-text-secondary)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={{
          p: ({ children }) => <p className="mb-2">{children}</p>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent-violet)] hover:underline"
            >
              {children}
            </a>
          ),
          code: ({ children, className, ...props }) => {
            const isBlock = Boolean(className?.includes("language-"));
            if (!isBlock) {
              return (
                <code
                  className="rounded-sm bg-white/[0.05] px-1.5 py-0.5 font-mono text-[14px]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={`${className ?? ""} font-mono text-[14px]`} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-md border border-[var(--color-border-standard)] bg-[var(--color-bg-surface)] p-3">
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-2 pl-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-2 pl-4">{children}</ol>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-[15px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-[var(--color-border-standard)] bg-white/[0.05] px-2 py-1 text-left font-[590]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[var(--color-border-standard)] px-2 py-1">
              {children}
            </td>
          ),
          h1: ({ children }) => <h1 className="mb-2 text-[15px] font-[590]">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 text-[15px] font-[590]">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 text-[15px] font-[590]">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-2 text-[15px] font-[590]">{children}</h4>,
          h5: ({ children }) => <h5 className="mb-2 text-[15px] font-[590]">{children}</h5>,
          h6: ({ children }) => <h6 className="mb-2 text-[15px] font-[590]">{children}</h6>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const TextSegment = memo(TextSegmentInner);
