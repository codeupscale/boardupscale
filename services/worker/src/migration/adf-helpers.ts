// services/worker/src/migration/adf-helpers.ts
// Pure ADF-to-text converter — no dependencies, fully testable in isolation.

/**
 * Convert an Atlassian Document Format (ADF) node to plain text.
 *
 * @param node          ADF node (any shape — gracefully handles unknown types)
 * @param attachmentMap Optional map of Jira media ID → filename for labelling
 *                      inline images. If omitted, falls back to "attachment".
 */
export function adfToText(node: any, attachmentMap?: Map<string, string>): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';

  // Leaf nodes with no content array
  switch (node.type) {
    case 'hardBreak':
      return '\n';
    case 'emoji':
      return node.attrs?.text ?? '';
    case 'mention':
      return `@${node.attrs?.text ?? 'user'}`;
    case 'inlineCard':
      return node.attrs?.url ?? '';
    case 'image':
      return `[📎 image: ${node.attrs?.src ?? 'image'}]\n`;
    case 'media': {
      if (node.attrs?.type === 'external') {
        return `[🔗 image: ${node.attrs.url ?? 'external image'}]\n`;
      }
      const filename = attachmentMap?.get(String(node.attrs?.id ?? '')) ?? 'attachment';
      return `[📎 image: ${filename}]\n`;
    }
  }

  if (!Array.isArray(node.content)) return '';
  const parts = node.content.map((c: any) => adfToText(c, attachmentMap));

  switch (node.type) {
    case 'doc':
      return parts.join('');
    case 'paragraph':
      return parts.join('') + '\n';
    case 'mediaSingle':
      return parts.join('') + '\n';
    case 'bulletList':
    case 'orderedList':
      return parts.join('');
    case 'listItem':
      return '- ' + parts.join('').trim() + '\n';
    case 'codeBlock':
      return '```\n' + parts.join('') + '```\n';
    case 'blockquote':
      return parts.map((p) => '> ' + p).join('');
    case 'heading': {
      const level = node.attrs?.level ?? 1;
      return '#'.repeat(level) + ' ' + parts.join('') + '\n';
    }
    case 'rule':
      return '---\n';
    default:
      return parts.join('');
  }
}
