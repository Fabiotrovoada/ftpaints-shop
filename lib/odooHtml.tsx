import { createElement, type ReactNode } from 'react';

/**
 * Renders an Odoo Html field (sale.order.note and friends) as React elements.
 *
 * These fields arrive as markup — Odoo seeds `note` with its T&Cs block
 * (`<p>Terms &amp; Conditions: <a href="…">…</a></p>`), which is why printing the
 * string shows tags. They can never go through dangerouslySetInnerHTML though:
 * checkout writes the customer's own note straight into the same field (see
 * app/checkout/page.tsx), so `<img onerror=…>` typed into the order notes box
 * would run for every staff member and account user who later opens that order.
 *
 * So: parse to React elements against a small allowlist, and drop everything else
 * — unknown tags, every attribute except a safe href, and the contents of
 * script/style. Anything dropped keeps its text, so no note ever loses its words.
 */

// Tag → element to render it as.
const ALLOWED: Record<string, string> = {
  b: 'strong', strong: 'strong',
  i: 'em', em: 'em',
  u: 'u', s: 's', del: 's',
  span: 'span', small: 'small',
  p: 'p', div: 'p',
  ul: 'ul', ol: 'ol', li: 'li',
  h1: 'strong', h2: 'strong', h3: 'strong', h4: 'strong', h5: 'strong', h6: 'strong',
  a: 'a',
};

// Tags whose body is markup, not prose — dropping the tag but keeping its text
// would print the stylesheet or the script source into the note.
const SKIP = new Set(['script', 'style', 'head', 'title', 'iframe', 'object', 'embed']);

const CLASSES: Record<string, string> = {
  p: 'mb-2 last:mb-0',
  ul: 'list-disc pl-5 mb-2 last:mb-0',
  ol: 'list-decimal pl-5 mb-2 last:mb-0',
  a: 'text-[#004475] underline break-words',
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  pound: '£', euro: '€', copy: '©', reg: '®', trade: '™',
  hellip: '…', ndash: '–', mdash: '—', deg: '°',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X'
        ? parseInt(ref.slice(2), 16)
        : parseInt(ref.slice(1), 10);
      // Reject anything outside the Unicode range or in the surrogate block, so a
      // crafted entity cannot throw out of the render.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      if (code >= 0xd800 && code <= 0xdfff) return whole;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? whole;
  });
}

/**
 * The only attribute that survives. Relative and protocol-relative URLs are
 * dropped along with javascript:/data: — a note lives inside Odoo, so a link
 * relative to the portal's own origin is meaningless anyway.
 */
function safeHref(attrs: string): string | null {
  const m = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
  const raw = m?.[1] ?? m?.[2] ?? m?.[3];
  if (!raw) return null;
  // Entities can hide a scheme (&#106;avascript:), so decode first; test with
  // whitespace and control characters stripped, since `java\nscript:` is still a
  // live URL to a browser, but link the URL as written.
  const href = decodeEntities(raw).trim();
  const scheme = href.replace(/[\s\u0000-\u001F\u007F]/g, '');
  return /^(https?:\/\/|mailto:|tel:)/i.test(scheme) ? href : null;
}

interface Frame {
  tag: string | null;
  el?: string;
  props?: Record<string, unknown>;
  children: ReactNode[];
}

export function renderOdooHtml(html: string): ReactNode[] {
  if (!html) return [];

  const root: Frame = { tag: null, children: [] };
  const stack: Frame[] = [root];
  const top = () => stack[stack.length - 1];
  let key = 0;

  function closeTop() {
    const frame = stack.pop()!;
    top().children.push(
      createElement(frame.el!, { key: `n${key++}`, ...frame.props }, ...frame.children)
    );
  }

  function addText(raw: string) {
    if (!raw) return;
    const text = decodeEntities(raw);
    if (text) top().children.push(text);
  }

  const tagRe = /<\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(html)) !== null) {
    addText(html.slice(cursor, m.index));
    cursor = tagRe.lastIndex;

    const name = m[1].toLowerCase();
    const attrs = m[2] || '';
    const isClosing = m[0][1] === '/';

    if (SKIP.has(name)) {
      if (!isClosing) {
        const close = html.toLowerCase().indexOf(`</${name}`, cursor);
        const end = close === -1 ? -1 : html.indexOf('>', close);
        cursor = end === -1 ? html.length : end + 1;
        tagRe.lastIndex = cursor;
      }
      continue;
    }

    if (name === 'br') {
      top().children.push(createElement('br', { key: `n${key++}` }));
      continue;
    }

    const el = ALLOWED[name];
    if (!el) continue; // unknown tag: drop the tag, keep whatever it wrapped

    if (isClosing) {
      // Close down to the matching frame. A stray </p> with nothing open is
      // ignored rather than unwinding everything opened so far.
      if (!stack.some(f => f.tag === name)) continue;
      while (top().tag !== name) closeTop();
      closeTop();
      continue;
    }

    // Self-closing (`<p/>`) has nothing to nest, and an <li> following an unclosed
    // <li> implicitly closes it — otherwise Odoo's looser markup nests every
    // remaining bullet inside the first one.
    if (attrs.trimEnd().endsWith('/')) continue;
    if (name === 'li' && top().tag === 'li') closeTop();

    const props: Record<string, unknown> = {};
    if (CLASSES[el]) props.className = CLASSES[el];
    if (el === 'a') {
      const href = safeHref(attrs);
      if (!href) continue; // an anchor we cannot trust becomes plain text
      props.href = href;
      props.target = '_blank';
      props.rel = 'noreferrer noopener';
    }
    stack.push({ tag: name, el, props, children: [] });
  }

  addText(html.slice(cursor));
  while (stack.length > 1) closeTop();
  return root.children;
}

/** The field's visible text, tags and entities resolved. */
export function odooHtmlToText(html: string): string {
  if (!html) return '';
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * True when there is something worth showing. Odoo stores an "empty" Html field
 * as `<p><br></p>`, which is a non-empty string and would otherwise render an
 * Order notes card with nothing in it.
 */
export function hasOdooHtmlContent(html: string | false | null | undefined): html is string {
  return typeof html === 'string' && odooHtmlToText(html).length > 0;
}

export function OdooHtml({ html, className }: { html: string; className?: string }) {
  return <div className={className}>{renderOdooHtml(html)}</div>;
}
