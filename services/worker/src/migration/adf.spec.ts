import { adfToText } from './adf-helpers';

describe('adfToText', () => {
  it('renders plain paragraph', () => {
    const node = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    };
    expect(adfToText(node)).toBe('Hello\n');
  });

  it('renders mediaSingle with known attachment filename', () => {
    const map = new Map([['abc-123', 'screenshot.png']]);
    const node = {
      type: 'mediaSingle',
      content: [{ type: 'media', attrs: { id: 'abc-123', type: 'file' } }],
    };
    expect(adfToText(node, map)).toBe('[📎 image: screenshot.png]\n');
  });

  it('renders mediaSingle with unknown attachment id using fallback', () => {
    const node = {
      type: 'mediaSingle',
      content: [{ type: 'media', attrs: { id: 'unknown-id', type: 'file' } }],
    };
    expect(adfToText(node)).toBe('[📎 image: attachment]\n');
  });

  it('renders external media as link reference', () => {
    const node = {
      type: 'media',
      attrs: { type: 'external', url: 'https://example.com/img.png' },
    };
    expect(adfToText(node)).toContain('[🔗 image: https://example.com/img.png]');
  });

  it('renders legacy image node', () => {
    const node = { type: 'image', attrs: { src: 'https://jira.example.com/secure/attachment/1/x.png' } };
    expect(adfToText(node)).toContain('[📎 image: https://jira.example.com/secure/attachment/1/x.png]');
  });

  it('renders emoji', () => {
    const node = { type: 'emoji', attrs: { text: '😀' } };
    expect(adfToText(node)).toBe('😀');
  });

  it('renders mention as @name', () => {
    const node = { type: 'mention', attrs: { text: 'alice' } };
    expect(adfToText(node)).toBe('@alice');
  });

  it('renders inlineCard URL', () => {
    const node = { type: 'inlineCard', attrs: { url: 'https://jira.example.com/browse/PROJ-1' } };
    expect(adfToText(node)).toBe('https://jira.example.com/browse/PROJ-1');
  });

  it('handles null/undefined gracefully', () => {
    expect(adfToText(null)).toBe('');
    expect(adfToText(undefined)).toBe('');
  });

  it('propagates attachmentMap through a full doc tree', () => {
    const map = new Map([['img-1', 'diagram.png']]);
    const node = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'See below:' }] },
        {
          type: 'mediaSingle',
          content: [{ type: 'media', attrs: { id: 'img-1', type: 'file' } }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Thanks' }] },
      ],
    };
    expect(adfToText(node, map)).toBe('See below:\n[📎 image: diagram.png]\nThanks\n');
  });

  it('renders hardBreak as newline', () => {
    expect(adfToText({ type: 'hardBreak' })).toBe('\n');
  });
});
