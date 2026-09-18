// LRM-13 tests for the fixed-template assembly and section-extraction
// helpers. Plain TypeScript, no Deno-specific globals, same pattern as
// draftValidation.test.ts / htmlUtils.test.ts.

import { describe, it, expect } from 'vitest';
import {
  buildBlastBody,
  extractTemplateSection,
  FOCUS_SECTION_START,
  FOCUS_SECTION_END,
  MEETINGS_SECTION_START,
  MEETINGS_SECTION_END,
} from './blastTemplate';

describe('buildBlastBody', () => {
  it('emits the fixed opener and focus block as its own <p> when a focus sentence is given', () => {
    const body = buildBlastBody({ focusSentence: 'Greet every patient by name at check-in.', meetingSummaryHtml: null });
    expect(body).toBe("<p>Hey there! This week's Lead RDA Focus is: Greet every patient by name at check-in.</p>");
  });

  it('emits the fixed meetings line followed by the meeting summary list', () => {
    const body = buildBlastBody({ focusSentence: null, meetingSummaryHtml: '<ul><li>Reviewed charting workflow</li></ul>' });
    expect(body).toBe("<p>At this week's Lead RDA meeting, we discussed:</p><ul><li>Reviewed charting workflow</li></ul>");
  });

  it('puts the focus block first, as its own contiguous unit, ahead of the meetings section', () => {
    const body = buildBlastBody({
      focusSentence: 'Keep every chart note complete before checkout.',
      meetingSummaryHtml: '<ul><li>Discussed the new intake form</li></ul>',
    });
    expect(body).toBe(
      "<p>Hey there! This week's Lead RDA Focus is: Keep every chart note complete before checkout.</p>" +
      "<p>At this week's Lead RDA meeting, we discussed:</p><ul><li>Discussed the new intake form</li></ul>",
    );
  });

  it('omits the focus block entirely (no placeholder) when there is no focus sentence', () => {
    const body = buildBlastBody({ focusSentence: null, meetingSummaryHtml: '<ul><li>Something</li></ul>' });
    expect(body).not.toContain('Focus');
    expect(body.startsWith("<p>At this week's Lead RDA meeting")).toBe(true);
  });

  it('omits the meetings block entirely (no placeholder) when there is no meeting summary', () => {
    const body = buildBlastBody({ focusSentence: 'Answer the phone within three rings.', meetingSummaryHtml: null });
    expect(body).not.toContain('we discussed');
  });

  it('treats a whitespace-only focus sentence the same as null', () => {
    const body = buildBlastBody({ focusSentence: '   ', meetingSummaryHtml: '<ul><li>x</li></ul>' });
    expect(body).not.toContain('Focus');
  });

  it('treats a whitespace-only meeting summary the same as null', () => {
    const body = buildBlastBody({ focusSentence: 'Smile at every patient.', meetingSummaryHtml: '  ' });
    expect(body).not.toContain('we discussed');
  });

  it('returns an empty string when both parts are absent', () => {
    expect(buildBlastBody({ focusSentence: null, meetingSummaryHtml: null })).toBe('');
  });

  it('HTML-escapes the focus sentence so a stray < or & from the model cannot break the wrapping <p>', () => {
    const body = buildBlastBody({ focusSentence: 'Chart & verify <before> checkout', meetingSummaryHtml: null });
    expect(body).toBe("<p>Hey there! This week's Lead RDA Focus is: Chart &amp; verify &lt;before&gt; checkout</p>");
  });
});

describe('extractTemplateSection', () => {
  it('extracts content between matching delimiters', () => {
    const raw = `${FOCUS_SECTION_START}\nGreet every patient warmly.\n${FOCUS_SECTION_END}`;
    expect(extractTemplateSection(raw, FOCUS_SECTION_START, FOCUS_SECTION_END)).toBe('Greet every patient warmly.');
  });

  it('extracts a section that appears after another section', () => {
    const raw = `${FOCUS_SECTION_START}Focus text${FOCUS_SECTION_END}${MEETINGS_SECTION_START}<ul><li>a</li></ul>${MEETINGS_SECTION_END}`;
    expect(extractTemplateSection(raw, MEETINGS_SECTION_START, MEETINGS_SECTION_END)).toBe('<ul><li>a</li></ul>');
    expect(extractTemplateSection(raw, FOCUS_SECTION_START, FOCUS_SECTION_END)).toBe('Focus text');
  });

  it('returns null when the start tag is missing', () => {
    expect(extractTemplateSection('no markers here', FOCUS_SECTION_START, FOCUS_SECTION_END)).toBeNull();
  });

  it('returns null when the end tag is missing', () => {
    expect(extractTemplateSection(`${FOCUS_SECTION_START}unterminated`, FOCUS_SECTION_START, FOCUS_SECTION_END)).toBeNull();
  });

  it('returns null for an empty (whitespace-only) section body', () => {
    expect(extractTemplateSection(`${FOCUS_SECTION_START}   ${FOCUS_SECTION_END}`, FOCUS_SECTION_START, FOCUS_SECTION_END)).toBeNull();
  });

  it('trims surrounding whitespace from the extracted content', () => {
    const raw = `${MEETINGS_SECTION_START}\n  <ul><li>a</li></ul>  \n${MEETINGS_SECTION_END}`;
    expect(extractTemplateSection(raw, MEETINGS_SECTION_START, MEETINGS_SECTION_END)).toBe('<ul><li>a</li></ul>');
  });
});
