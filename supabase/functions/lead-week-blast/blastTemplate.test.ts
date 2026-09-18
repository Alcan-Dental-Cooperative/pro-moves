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
  it('wraps a focus-only draft in the greeting, headed focus block, and sign-off', () => {
    const body = buildBlastBody({ focusSentence: 'Greet every patient by name at check-in.', meetingSummaryHtml: null });
    expect(body).toBe(
      '<p>Hey there!</p>' +
      "<p><strong>This week's Lead RDA Focus</strong><br>Greet every patient by name at check-in.</p>" +
      '<p>Have a great week!</p>',
    );
  });

  it('emits the meetings header <p> followed by the meeting summary list', () => {
    const body = buildBlastBody({ focusSentence: null, meetingSummaryHtml: '<ul><li>Reviewed charting workflow</li></ul>' });
    expect(body).toBe(
      '<p>Hey there!</p>' +
      "<p><strong>From this week's Lead RDA meeting</strong></p><ul><li>Reviewed charting workflow</li></ul>" +
      '<p>Have a great week!</p>',
    );
  });

  it('puts the focus block first, as its own contiguous <p>, ahead of the meetings section', () => {
    const body = buildBlastBody({
      focusSentence: 'Keep every chart note complete before checkout.',
      meetingSummaryHtml: '<ul><li>Discussed the new intake form</li></ul>',
    });
    expect(body).toBe(
      '<p>Hey there!</p>' +
      "<p><strong>This week's Lead RDA Focus</strong><br>Keep every chart note complete before checkout.</p>" +
      "<p><strong>From this week's Lead RDA meeting</strong></p><ul><li>Discussed the new intake form</li></ul>" +
      '<p>Have a great week!</p>',
    );
  });

  it('omits the focus block entirely (no placeholder) when there is no focus sentence', () => {
    const body = buildBlastBody({ focusSentence: null, meetingSummaryHtml: '<ul><li>Something</li></ul>' });
    expect(body).not.toContain('Focus');
    expect(body.startsWith("<p>Hey there!</p><p><strong>From this week's Lead RDA meeting")).toBe(true);
  });

  it('omits the meetings block entirely (no placeholder) when there is no meeting summary', () => {
    const body = buildBlastBody({ focusSentence: 'Answer the phone within three rings.', meetingSummaryHtml: null });
    expect(body).not.toContain('Lead RDA meeting');
  });

  it('treats a whitespace-only focus sentence the same as null', () => {
    const body = buildBlastBody({ focusSentence: '   ', meetingSummaryHtml: '<ul><li>x</li></ul>' });
    expect(body).not.toContain('Focus');
  });

  it('treats a whitespace-only meeting summary the same as null', () => {
    const body = buildBlastBody({ focusSentence: 'Smile at every patient.', meetingSummaryHtml: '  ' });
    expect(body).not.toContain('Lead RDA meeting');
  });

  it('returns an empty string (no greeting-only shell) when both parts are absent', () => {
    expect(buildBlastBody({ focusSentence: null, meetingSummaryHtml: null })).toBe('');
  });

  it('HTML-escapes the focus sentence so a stray < or & from the model cannot break the wrapping <p>', () => {
    const body = buildBlastBody({ focusSentence: 'Chart & verify <before> checkout', meetingSummaryHtml: null });
    expect(body).toContain("<strong>This week's Lead RDA Focus</strong><br>Chart &amp; verify &lt;before&gt; checkout</p>");
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

  // QA hardening: first-match indexOf extraction is exact for a
  // well-formed response, but a pathological one that nests another
  // section's markers inside this one would otherwise have them survive as
  // ordinary text -- they aren't in the HTML tag allowlist, so
  // sanitizeBlastHtml doesn't strip them and they'd reach a doctor's inbox
  // as visible bracket text. Reject instead of emitting marker text.
  it('rejects a section whose content nests another section\'s markers (pathological model response)', () => {
    const raw = `${FOCUS_SECTION_START}intro ${MEETINGS_SECTION_START}bad<ul><li>x</li></ul>${MEETINGS_SECTION_END} outro${FOCUS_SECTION_END}`;
    expect(extractTemplateSection(raw, FOCUS_SECTION_START, FOCUS_SECTION_END)).toBeNull();
  });

  it('rejects a section whose content contains a duplicated start tag', () => {
    const raw = `${FOCUS_SECTION_START}first ${FOCUS_SECTION_START} second${FOCUS_SECTION_END}`;
    expect(extractTemplateSection(raw, FOCUS_SECTION_START, FOCUS_SECTION_END)).toBeNull();
  });

  it('rejects a section whose content contains a duplicated end tag', () => {
    const raw = `${MEETINGS_SECTION_START}one${MEETINGS_SECTION_END} stray text ${MEETINGS_SECTION_END}`;
    // The first end tag closes the section; the content between start and
    // that first end tag is clean ('one'), so this one is NOT rejected --
    // pinning that only a marker appearing INSIDE the extracted content
    // (not trailing text after it) triggers the rejection.
    expect(extractTemplateSection(raw, MEETINGS_SECTION_START, MEETINGS_SECTION_END)).toBe('one');
  });
});
