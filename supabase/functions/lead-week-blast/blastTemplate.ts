// LRM-13: pure template assembly for the "Summarize meeting" draft output.
// The composer used to trust the model to reproduce the fixed opener and
// section lines verbatim inside a single freeform response; this instead
// keeps the literal English in code, so it can never drift, go missing, or
// get reworded by the model. The model supplies only the two variable
// pieces: the focus rephrased into one plain-language aspirational sentence,
// and the meeting summary as an HTML bullet list. See
// docs/specs/lrm-13-composer-first.md, decision 3 and 4.
//
// Template shape (John's live-test amendment, 2026-09-18): the draft must
// read as ready-to-send, not a rough draft -- greeting on its own line, each
// section under a short <strong> header, and a fixed sign-off, instead of
// the original single run-on paragraph.

export interface BlastTemplateParts {
  /**
   * The week's focus, rephrased by the model into one complete,
   * plain-language aspirational sentence (never the verbatim focus
   * wording -- decision 4 deliberately reverses the old VERBATIM rule).
   * Plain text, no HTML tags: this gets wrapped in a single <p> below so a
   * user can select and delete the whole focus block in one gesture.
   * `null` when the week has no published focus (or the caller excluded
   * it) -- the focus block is then omitted entirely, no placeholder.
   */
  focusSentence: string | null;
  /**
   * A constrained-HTML bullet list (`<ul><li>...</li></ul>`) summarizing
   * the checked meetings. `null` when no meetings were included -- the
   * meetings block is then omitted entirely, no placeholder.
   */
  meetingSummaryHtml: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Assembles the fixed template around the model-supplied content. The focus
 * block, when present, is always its own single `<p>` (header + `<br>` +
 * sentence) -- a contiguous unit at the top of the body, distinct from the
 * meeting summary below it, so it can be selected and deleted in one gesture
 * without touching the rest (decision 3). A section with no content is
 * simply absent -- never a placeholder like "(no meetings this week)". The
 * greeting and sign-off wrap whichever sections exist; when BOTH parts are
 * absent the result is an empty string (callers guarantee at least one
 * section before drafting, so an all-empty body is "no draft", not a
 * greeting-only shell).
 */
export function buildBlastBody(parts: BlastTemplateParts): string {
  const focusSentence = parts.focusSentence?.trim();
  const meetingSummaryHtml = parts.meetingSummaryHtml?.trim();
  if (!focusSentence && !meetingSummaryHtml) return '';

  const sections: string[] = ['<p>Hey there!</p>'];

  if (focusSentence) {
    sections.push(`<p><strong>This week's Lead RDA Focus</strong><br>${escapeHtml(focusSentence)}</p>`);
  }

  if (meetingSummaryHtml) {
    sections.push(`<p><strong>From this week's Lead RDA meeting</strong></p>`);
    sections.push(meetingSummaryHtml);
  }

  sections.push('<p>Have a great week!</p>');
  return sections.join('');
}

// Delimiters the model is asked to wrap its two content pieces in, so the
// literal wrapper text never has to pass through the model at all. Square
// brackets doubled up so they can't collide with ordinary prose or with
// HTML output rules include Markdown/asterisks etc, and are simple to scan
// for with indexOf rather than a fragile regex.
export const FOCUS_SECTION_START = '[[FOCUS]]';
export const FOCUS_SECTION_END = '[[/FOCUS]]';
export const MEETINGS_SECTION_START = '[[MEETINGS]]';
export const MEETINGS_SECTION_END = '[[/MEETINGS]]';

// QA hardening: every marker literal the model can be asked to emit, used
// below to reject a section whose extracted content itself contains a
// marker -- see extractTemplateSection's own comment for why.
const ALL_TEMPLATE_TAGS = [
  FOCUS_SECTION_START, FOCUS_SECTION_END,
  MEETINGS_SECTION_START, MEETINGS_SECTION_END,
];

/**
 * Pulls one delimited section out of a raw model response. Returns `null`
 * when the section is missing, malformed (end before start), or empty after
 * trimming -- callers treat `null` the same as "the model didn't produce
 * this part", which for the focus/meetings sections above means that part
 * of the template is simply omitted rather than emitted blank.
 *
 * QA hardening: also returns `null` when the extracted content itself
 * contains any template marker substring. First-match indexOf extraction is
 * exact for a well-formed response, but a pathological one that nests or
 * duplicates a marker -- e.g.
 * `[[FOCUS]]...[[MEETINGS]]...[[/MEETINGS]]...[[/FOCUS]]` -- would
 * otherwise have its FOCUS extraction swallow the literal `[[MEETINGS]]`
 * markers as ordinary text; those aren't in HTML_OUTPUT_RULES's tag
 * allowlist, so sanitizeBlastHtml doesn't strip them and they'd survive as
 * visible bracket text in a doctor's inbox. Rejecting the section here
 * instead means a required section failing this way surfaces as index.ts's
 * existing 502 "Draft generation failed" -- a clear error instead of
 * malformed output silently reaching a doctor.
 */
export function extractTemplateSection(raw: string, startTag: string, endTag: string): string | null {
  const startIdx = raw.indexOf(startTag);
  if (startIdx === -1) return null;
  const contentStart = startIdx + startTag.length;
  const endIdx = raw.indexOf(endTag, contentStart);
  if (endIdx === -1 || endIdx < contentStart) return null;
  const content = raw.slice(contentStart, endIdx).trim();
  if (content.length === 0) return null;
  if (ALL_TEMPLATE_TAGS.some((tag) => content.includes(tag))) return null;
  return content;
}
