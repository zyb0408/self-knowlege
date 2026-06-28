import { marked } from 'marked';

// Max text size for marked lexer parsing (500KB).
// Above this limit, use raw text directly to prevent OOM.
const MAX_PARSE_SIZE = 500 * 1024;

export function parseMarkdown(md: string): string {
  if (md.length > MAX_PARSE_SIZE) {
    // For large files, skip the token-based parser and use raw text.
    // Remove common markdown syntax minimally to keep the text usable.
    return cleanRawMarkdown(md);
  }

  try {
    const tokens = marked.lexer(md);
    return extractText(tokens, 0);
  } catch {
    // If marked fails for any reason, fall back to raw text
    return cleanRawMarkdown(md);
  }
}

function cleanRawMarkdown(md: string): string {
  return (
    md
      // Remove code fences but keep content
      .replace(/^```[\s\S]*?```/gm, '')
      // Remove image syntax
      .replace(/!\[.*?\]\(.*?\)/g, '')
      // Remove link syntax, keep text
      .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
      // Remove heading markers but keep the text
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic markers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Remove blockquote markers
      .replace(/^>\s?/gm, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, '')
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function extractText(tokens: any[], depth: number): string {
  const parts: string[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        parts.push('\n\n' + '#'.repeat(depth + 1) + ' ' + (token.text || ''));
        if (token.tokens && token.tokens.length > 0) {
          parts.push(extractText(token.tokens, depth + 1));
        }
        break;

      case 'paragraph':
        parts.push('\n\n' + (token.text || ''));
        if (token.tokens && token.tokens.length > 0) {
          parts.push(extractText(token.tokens, depth + 1));
        }
        break;

      case 'list':
        parts.push('\n\n' + extractText(token.tokens || [], depth));
        break;

      case 'list_item':
        parts.push('\n- ' + (token.text || ''));
        if (token.tokens && token.tokens.length > 0) {
          parts.push(extractText(token.tokens, depth + 1));
        }
        break;

      case 'blockquote':
        parts.push('\n> ' + (token.text || ''));
        if (token.tokens && token.tokens.length > 0) {
          parts.push(extractText(token.tokens, depth + 1));
        }
        break;

      case 'table': {
        const header = (token.header || []).join(' | ');
        parts.push('\n\n' + header);
        parts.push('\n' + header.split('|').map(() => '---').join('|'));
        if (token.rows) {
          for (const row of token.rows) {
            parts.push('\n' + row.join(' | '));
          }
        }
        break;
      }

      case 'code':
        // Keep code content for embedding — useful information
        if (token.text) {
          parts.push('\n\n' + token.text);
        }
        break;

      case 'image':
        // Skip image links
        break;

      case 'html':
        // Skip raw HTML
        break;

      default:
        if (token.text) {
          parts.push(token.text);
        }
    }
  }

  return parts.join('');
}
