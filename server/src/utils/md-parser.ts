import { marked } from 'marked';

export function parseMarkdown(md: string): string {
  const tokens = marked.lexer(md);
  return extractText(tokens, 0);
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
        // Skip code blocks
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
