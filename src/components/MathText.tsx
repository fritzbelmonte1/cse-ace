import { useMemo, useEffect, useState } from 'react';

interface MathTextProps {
  text: string;
  className?: string;
}

// Extend Window interface to include katex from CDN
declare global {
  interface Window {
    katex?: {
      renderToString: (latex: string, options?: any) => string;
    };
  }
}

export const MathText = ({ text, className = '' }: MathTextProps) => {
  const [isKatexLoaded, setIsKatexLoaded] = useState(!!window.katex);

  useEffect(() => {
    // If already loaded, no need to poll
    if (window.katex) {
      setIsKatexLoaded(true);
      return;
    }

    // Poll for KaTeX to become available
    const checkInterval = setInterval(() => {
      if (window.katex) {
        setIsKatexLoaded(true);
        clearInterval(checkInterval);
      }
    }, 100);

    return () => clearInterval(checkInterval);
  }, []);

  const renderedContent = useMemo(() => {
    // Show plain text fallback while KaTeX loads
    if (!isKatexLoaded || !window.katex) {
      return <span className={className}>{text}</span>;
    }

    // Regex to match both inline ($...$) and display ($$...$$) math
    const mathRegex = /(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g;
    const parts = text.split(mathRegex);

    return parts.map((part, index) => {
      // Check if this part is math notation
      if (part.startsWith('$$') && part.endsWith('$$')) {
        // Display math (centered, block-level)
        const latex = part.slice(2, -2);
        try {
          const html = window.katex!.renderToString(latex, {
            displayMode: true,
            throwOnError: false,
          });
          return (
            <span
              key={index}
              dangerouslySetInnerHTML={{ __html: html }}
              className="block my-4"
            />
          );
        } catch (e) {
          console.error('KaTeX rendering error:', e);
          return <span key={index} className="text-destructive">{part}</span>;
        }
      } else if (part.startsWith('$') && part.endsWith('$')) {
        // Inline math
        const latex = part.slice(1, -1);
        try {
          const html = window.katex!.renderToString(latex, {
            displayMode: false,
            throwOnError: false,
          });
          return (
            <span
              key={index}
              dangerouslySetInnerHTML={{ __html: html }}
              className="inline-block mx-0.5"
            />
          );
        } catch (e) {
          console.error('KaTeX rendering error:', e);
          return <span key={index} className="text-destructive">{part}</span>;
        }
      } else {
        // Regular text - preserve whitespace and line breaks
        return <span key={index} className="whitespace-pre-wrap">{part}</span>;
      }
    });
  }, [text, isKatexLoaded, className]);

  return <div className={className}>{renderedContent}</div>;
};
