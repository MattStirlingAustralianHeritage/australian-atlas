// ============================================================
// Journal article body renderer — server-side, dependency-free.
//
// Article bodies are stored as plaintext markdown in the master
// `articles` table (body writes are trigger-locked; this module
// only ever READS). The subset below mirrors what the admin CMS
// editor produces: headings, emphasis, links, images, quotes,
// lists, and `---` breaks. Everything is HTML-escaped before any
// markup is introduced, so stored text can never inject tags.
// ============================================================

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Inline transforms shared by paragraphs, list items, and quotes.
function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
}

/**
 * Convert an article body (markdown plaintext) to editorial HTML.
 * Output classes hook into the .article-body stylesheet:
 *   blockquote  → pull-quote treatment
 *   hr          → dinkus section break
 *   figure.fig  → popout image with caption from alt text
 */
export function articleBodyToHtml(md) {
  if (!md) return ''
  const escaped = escapeHtml(md)
  const blocks = escaped.split(/\n{2,}/)
  const out = []

  for (const raw of blocks) {
    const block = raw.trim()
    if (!block) continue

    // Section break
    if (/^---+$/.test(block)) { out.push('<hr />'); continue }

    // Headings (single-line blocks)
    const h = block.match(/^(#{1,3}) (.+)$/)
    if (h && !block.includes('\n')) {
      const level = Math.max(2, h[1].length) // h1 in body demotes to h2
      out.push(`<h${level}>${inline(h[2])}</h${level}>`)
      continue
    }

    // Image (own block): ![caption](url) with the CMS editor's optional
    // {width=NN%} suffix. Width scales the figure within its column.
    const img = block.match(IMAGE_LINE)
    if (img) {
      out.push(figureHtml(img))
      continue
    }

    // Blockquote — every line starts with "> "
    if (block.split('\n').every(l => /^&gt; ?/.test(l.trim()))) {
      const text = block.split('\n').map(l => l.trim().replace(/^&gt; ?/, '')).join(' ')
      out.push(`<blockquote><p>${inline(text)}</p></blockquote>`)
      continue
    }

    // Lists — every line is a bullet or a number
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.every(l => /^- /.test(l))) {
      out.push(`<ul>${lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`)
      continue
    }
    if (lines.every(l => /^\d+\. /.test(l))) {
      out.push(`<ol>${lines.map(l => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`)
      continue
    }

    // Mixed block — image-only lines become figures, the rest one paragraph
    const textLines = []
    for (const line of lines) {
      const inlineImg = line.match(IMAGE_LINE)
      if (inlineImg) {
        if (textLines.length) { out.push(`<p>${inline(textLines.join(' '))}</p>`); textLines.length = 0 }
        out.push(figureHtml(inlineImg))
      } else {
        textLines.push(line)
      }
    }
    if (textLines.length) out.push(`<p>${inline(textLines.join(' '))}</p>`)
  }

  return out.join('\n')
}

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)%?\})?$/

function figureHtml([, alt, src, width]) {
  const w = width && Number(width) < 100 ? ` style="width:${Number(width)}%;margin-inline:auto"` : ''
  const caption = alt ? `<figcaption>${inline(alt)}</figcaption>` : ''
  return `<figure class="fig"${w}><img src="${src.trim()}" alt="${alt}" loading="lazy" />${caption}</figure>`
}

/** Words-per-minute reading estimate, matching the vertical journals' 200wpm. */
export function readingTime(body) {
  if (!body) return null
  return Math.max(1, Math.ceil(body.split(/\s+/).filter(Boolean).length / 200))
}
