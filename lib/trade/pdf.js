/**
 * Atlas Trade — dependency-free PDF generator.
 *
 * Builds a valid PDF using only the two standard built-in fonts (Helvetica,
 * Helvetica-Bold). No font embedding, no native deps, no bundled .afm files —
 * so it behaves identically locally and in the Vercel serverless runtime.
 *
 * The "Curated via Atlas" attribution is rendered on every page footer — it is
 * a condition of use and is not parameterised away by callers.
 */
import { ATLAS_ATTRIBUTION } from './config'
import { legBetween } from './distance'

// A4 in points.
const PAGE_W = 595.28
const PAGE_H = 841.89
const M_LEFT = 56
const M_RIGHT = 56
const M_TOP = 64
const M_BOTTOM = 64
const CONTENT_W = PAGE_W - M_LEFT - M_RIGHT

// Helvetica glyph advance widths (1/1000 em) for char codes 32..126.
// Standard AFM values. Helvetica-Bold is slightly wider — approximated with a
// uniform factor for wrapping (a hair conservative, never overflows).
const HELV_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
const BOLD_FACTOR = 1.05

/** Replace common non-ASCII typography with ASCII so width/encoding stay exact. */
function toAscii(s) {
  if (s == null) return ''
  return String(s)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
}

function charWidth(code, size, bold) {
  const w = code >= 32 && code <= 126 ? HELV_WIDTHS[code - 32] : 556
  return (w / 1000) * size * (bold ? BOLD_FACTOR : 1)
}

function stringWidth(str, size, bold) {
  let w = 0
  for (let i = 0; i < str.length; i++) w += charWidth(str.charCodeAt(i), size, bold)
  return w
}

/** Greedy word-wrap to a max width. Returns an array of lines. */
function wrap(str, size, bold, maxW) {
  const words = str.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word
    if (stringWidth(candidate, size, bold) <= maxW || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Escape a PDF text string (parentheses + backslash). */
function pdfEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

class PdfDoc {
  constructor() {
    this.pages = [[]]
    this.y = PAGE_H - M_TOP
  }

  _page() { return this.pages[this.pages.length - 1] }

  _newPage() {
    this.pages.push([])
    this.y = PAGE_H - M_TOP
    this._footer()
  }

  // Footer attribution on every page. Drawn immediately when a page begins.
  _footer() {
    const size = 8
    const text = `${ATLAS_ATTRIBUTION}  ·  australianatlas.com.au`.replace(/·/g, '-')
    this._page().push(
      `BT /F2 ${size} Tf 0.77 0.59 0.17 rg ${M_LEFT.toFixed(2)} ${(M_BOTTOM - 22).toFixed(2)} Td (${pdfEscape(toAscii(text))}) Tj ET`
    )
  }

  ensure(h) {
    if (this.y - h < M_BOTTOM) this._newPage()
  }

  space(h) { this.y -= h }

  rule(color = [0.85, 0.82, 0.77], width = 0.75) {
    this.ensure(8)
    this.y -= 6
    const [r, g, b] = color
    this._page().push(
      `${r} ${g} ${b} RG ${width} w ${M_LEFT.toFixed(2)} ${this.y.toFixed(2)} m ${(PAGE_W - M_RIGHT).toFixed(2)} ${this.y.toFixed(2)} l S`
    )
    this.y -= 6
  }

  /**
   * Draw a text block with wrapping.
   *   opts: { bold, size, color:[r,g,b], indent, lineGapAfter, leadingFactor }
   */
  text(str, opts = {}) {
    const {
      bold = false,
      size = 11,
      color = [0.11, 0.10, 0.09],
      indent = 0,
      lineGapAfter = 6,
      leadingFactor = 1.32,
    } = opts
    const fontRef = bold ? 'F2' : 'F1'
    const [r, g, b] = color
    const x = M_LEFT + indent
    const maxW = CONTENT_W - indent
    const lines = wrap(toAscii(str), size, bold, maxW)
    const lineH = size * leadingFactor
    for (const line of lines) {
      this.ensure(lineH)
      this.y -= size // baseline
      this._page().push(
        `BT /F${fontRef.slice(1)} ${size} Tf ${r} ${g} ${b} rg ${x.toFixed(2)} ${this.y.toFixed(2)} Td (${pdfEscape(line)}) Tj ET`
      )
      this.y -= (lineH - size)
    }
    this.y -= lineGapAfter
  }

  /** Serialise to a Buffer. */
  build() {
    // Ensure first page carries its footer.
    if (this.pages[0].length === 0 || !this.pages[0].some((op) => op.includes(ATLAS_ATTRIBUTION.replace(/·/g, '-')))) {
      // Footer for page 1 (prepend so it's drawn under content).
      const size = 8
      const text = `${ATLAS_ATTRIBUTION}  -  australianatlas.com.au`
      this.pages[0].unshift(
        `BT /F2 ${size} Tf 0.77 0.59 0.17 rg ${M_LEFT.toFixed(2)} ${(M_BOTTOM - 22).toFixed(2)} Td (${pdfEscape(toAscii(text))}) Tj ET`
      )
    }

    const objects = []
    const N = this.pages.length

    // 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then per page: content + page.
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'

    const pageObjNums = []
    for (let i = 0; i < N; i++) pageObjNums.push(6 + i * 2)
    objects[2] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${N} >>`
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'

    for (let i = 0; i < N; i++) {
      const contentNum = 5 + i * 2
      const pageNum = 6 + i * 2
      const stream = this.pages[i].join('\n')
      objects[contentNum] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
      objects[pageNum] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>`
    }

    // Assemble with xref.
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
    const offsets = []
    const maxObj = objects.length - 1
    for (let n = 1; n <= maxObj; n++) {
      offsets[n] = Buffer.byteLength(out, 'latin1')
      out += `${n} 0 obj\n${objects[n]}\nendobj\n`
    }

    const xrefStart = Buffer.byteLength(out, 'latin1')
    let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`
    for (let n = 1; n <= maxObj; n++) {
      xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
    }
    out += xref
    out += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

    return Buffer.from(out, 'latin1')
  }
}

const GOLD = [0.77, 0.59, 0.17]
const INK = [0.11, 0.10, 0.09]
const MUTED = [0.42, 0.40, 0.38]
const BODY = [0.25, 0.24, 0.22]

/** One stop block (shared by the flat and day-grouped renders). */
function drawStop(doc, s, num) {
  const timeBit = s.time_hint ? `${s.time_hint}   ` : ''
  doc.text(`${num}   ${timeBit}${s.name}`, { bold: true, size: 13, color: INK, lineGapAfter: 3 })

  const meta = [s.vertical_label, s.sub_type, s.region || s.suburb, s.state].filter(Boolean).join('  ·  ')
  if (meta) doc.text(meta, { size: 9.5, color: MUTED, indent: 22, lineGapAfter: 3 })

  if (s.description) {
    const d = s.description.length > 320 ? s.description.slice(0, 320).replace(/\s+\S*$/, '') + '...' : s.description
    doc.text(d, { size: 10, color: BODY, indent: 22, lineGapAfter: 3 })
  }

  if (s.notes) doc.text(`Note: ${s.notes}`, { size: 10, color: MUTED, indent: 22, lineGapAfter: 3 })

  // Trade enrichment — only for opted-in operators.
  if (s.trade_ready && s.trade) {
    const t = s.trade
    const bits = []
    if (t.contact_before_booking) bits.push('Contact operator before booking')
    if (t.rates_available) bits.push('Trade rates available')
    if (t.group && t.group_size_max) bits.push(`Groups up to ${t.group_size_max}`)
    else if (t.group) bits.push('Welcomes groups')
    if (t.bespoke) bits.push('Welcomes bespoke trade')
    doc.text(`TRADE  ·  ${bits.join('  ·  ') || 'Trade-ready'}`, {
      bold: true, size: 9, color: GOLD, indent: 22, lineGapAfter: 8,
    })
  } else {
    doc.space(5)
  }
}

/**
 * Build the itinerary PDF. `itinerary` is a trade_itineraries row; `stops` are
 * hydrated, enriched stops (from lib/trade/itinerary). Optional `account`
 * co-brands the header ("Prepared by …") — beside the Atlas attribution,
 * never instead of it. Returns a Buffer.
 */
export function buildItineraryPdf(itinerary, stops, account = null) {
  const doc = new PdfDoc()

  doc.text('AUSTRALIAN ATLAS  ·  FOR THE TRADE', { bold: true, size: 9, color: GOLD, lineGapAfter: 4 })
  if (account?.org_name) {
    doc.text(`Prepared by ${account.org_name}${account.org_website ? `  ·  ${account.org_website}` : ''}`, {
      size: 9, color: MUTED, lineGapAfter: 8,
    })
  } else {
    doc.space(6)
  }
  doc.text(itinerary.title || 'Trade itinerary', { bold: true, size: 22, color: INK, lineGapAfter: 4 })

  const dayCount = Math.max(1, ...stops.map((s) => s.day || 1))
  const sub = [
    itinerary.client_name ? `Prepared for ${itinerary.client_name}` : null,
    itinerary.region,
    dayCount > 1 ? `${dayCount} days` : null,
    `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`,
  ]
    .filter(Boolean)
    .join('  ·  ')
  if (sub) doc.text(sub, { size: 11, color: MUTED, lineGapAfter: 6 })
  if (itinerary.cover_note) doc.text(itinerary.cover_note, { size: 11, color: BODY, lineGapAfter: 6 })
  else if (itinerary.intent_text) doc.text(itinerary.intent_text, { size: 11, color: MUTED, lineGapAfter: 8 })

  doc.rule()
  doc.space(4)

  // Group by day; render day headers only when the itinerary spans days.
  let num = 0
  for (let day = 1; day <= dayCount; day++) {
    const dayStops = stops.filter((s) => (s.day || 1) === day)
    if (dayStops.length === 0) continue
    if (dayCount > 1) {
      doc.space(2)
      doc.text(`DAY ${day}`, { bold: true, size: 10.5, color: GOLD, lineGapAfter: 6 })
    }
    dayStops.forEach((s, i) => {
      num += 1
      drawStop(doc, s, String(num).padStart(2, '0'))
      // Leg to the next stop on the same day (planning hint, clearly approximate).
      const next = dayStops[i + 1]
      const leg = next ? legBetween(s, next) : null
      if (leg) doc.text(`|  ${leg.label}`, { size: 8.5, color: MUTED, indent: 22, lineGapAfter: 6 })
    })
  }

  doc.rule()
  doc.text(
    `${ATLAS_ATTRIBUTION}. Built on the curated Australian Atlas network of independent operators. ` +
    'Trade rates and capacity are indicative, and drive times are estimates — confirm directly with each operator before booking.',
    { size: 9, color: MUTED, lineGapAfter: 0 }
  )

  return doc.build()
}

/**
 * Build the product fact sheet PDF — the trade one-pager for a single
 * trade-ready venue. `sheet` comes from lib/trade/factsheet (gated surface:
 * includes the trade contact channel). Returns a Buffer.
 */
export function buildFactSheetPdf(sheet) {
  const doc = new PdfDoc()

  doc.text('AUSTRALIAN ATLAS  ·  TRADE PRODUCT FACT SHEET', { bold: true, size: 9, color: GOLD, lineGapAfter: 10 })
  doc.text(sheet.name, { bold: true, size: 22, color: INK, lineGapAfter: 4 })
  const meta = [sheet.vertical_label, sheet.sub_type, sheet.region || sheet.suburb, sheet.state]
    .filter(Boolean)
    .join('  ·  ')
  if (meta) doc.text(meta, { size: 11, color: MUTED, lineGapAfter: 8 })

  doc.rule()
  doc.space(2)

  if (sheet.description) {
    const d = sheet.description.length > 700
      ? sheet.description.slice(0, 700).replace(/\s+\S*$/, '') + '...'
      : sheet.description
    doc.text(d, { size: 10.5, color: BODY, lineGapAfter: 10 })
  }

  // ── The venue ──
  doc.text('THE VENUE', { bold: true, size: 10, color: GOLD, lineGapAfter: 5 })
  const venueRows = [
    sheet.address ? ['Address', sheet.address] : null,
    sheet.website ? ['Website', sheet.website] : null,
    sheet.founded_year ? ['Founded', String(sheet.founded_year)] : null,
    sheet.is_owner_operator ? ['Ownership', 'Independent, owner-operated'] : ['Ownership', 'Independent'],
  ].filter(Boolean)
  for (const [k, v] of venueRows) {
    doc.text(`${k}:  ${v}`, { size: 10, color: BODY, indent: 10, lineGapAfter: 3 })
  }
  doc.space(6)

  // ── Working with the trade ──
  doc.text('WORKING WITH THE TRADE', { bold: true, size: 10, color: GOLD, lineGapAfter: 5 })
  const t = sheet.trade || {}
  const p = sheet.profile || {}
  const tradeRows = [
    ['Engagement', [t.bespoke && 'Bespoke / FIT', t.group && 'Groups'].filter(Boolean).join('  +  ') || 'By arrangement'],
    t.group ? ['Group ceiling', t.group_size_max ? `Up to ${t.group_size_max}` : 'No stated ceiling — confirm'] : null,
    ['Trade rates', t.rates_available ? 'Available on request' : 'Not stated — confirm directly'],
    t.contact_before_booking ? ['Booking', 'Contact the operator before including in a program'] : null,
    p.notice_days != null ? ['Minimum notice', p.notice_days === 0 ? 'Same-day possible' : `${p.notice_days} day${p.notice_days === 1 ? '' : 's'}`] : null,
    p.coach_access ? ['Coach access', 'Coach parking / access available'] : null,
    (p.languages || []).length ? ['Languages', p.languages.join(', ')] : null,
    p.dietary_notes ? ['Dietary', p.dietary_notes] : null,
    p.capacity_notes ? ['Capacity', p.capacity_notes] : null,
    p.seasonal_notes ? ['Seasonality', p.seasonal_notes] : null,
    p.insurance_confirmed ? ['Insurance', 'Current public liability insurance confirmed by operator'] : null,
    p.famil_open ? ['Famils', 'Open to famil visits by trade buyers'] : null,
  ].filter(Boolean)
  for (const [k, v] of tradeRows) {
    doc.text(`${k}:  ${v}`, { size: 10, color: BODY, indent: 10, lineGapAfter: 3 })
  }
  doc.space(6)

  // ── Trade contact (gated artefact) ──
  doc.text('TRADE CONTACT', { bold: true, size: 10, color: GOLD, lineGapAfter: 5 })
  const c = sheet.contact || {}
  const contactRows = [
    c.name ? ['Contact', c.name] : null,
    c.email ? ['Email', c.email] : null,
    c.phone ? ['Phone', c.phone] : null,
  ].filter(Boolean)
  if (contactRows.length === 0) {
    doc.text('Enquire via Atlas Trade — trade@australianatlas.com.au', { size: 10, color: BODY, indent: 10, lineGapAfter: 3 })
  }
  for (const [k, v] of contactRows) {
    doc.text(`${k}:  ${v}`, { size: 10, color: BODY, indent: 10, lineGapAfter: 3 })
  }
  doc.space(4)

  // ── Readiness checklist ──
  if (sheet.checklist?.items?.length) {
    doc.rule()
    doc.text(
      `TRADE READINESS  ·  ${sheet.checklist.done} of ${sheet.checklist.total} stated`,
      { bold: true, size: 10, color: GOLD, lineGapAfter: 5 }
    )
    for (const item of sheet.checklist.items) {
      doc.text(`${item.done ? '[x]' : '[ ]'}  ${item.label}`, {
        size: 9.5, color: item.done ? BODY : MUTED, indent: 10, lineGapAfter: 2.5,
      })
    }
    doc.space(4)
  }

  doc.rule()
  doc.text(
    `${ATLAS_ATTRIBUTION}. This fact sheet is for travel-trade use — details are operator-stated and indicative. ` +
    'Confirm rates, capacity and conditions directly with the operator before contracting.',
    { size: 9, color: MUTED, lineGapAfter: 0 }
  )

  return doc.build()
}
