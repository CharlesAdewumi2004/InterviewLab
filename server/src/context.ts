import type { EditSummary, NarrationSegment, Session } from './types.js';
import { activeMs } from './session.js';
import { designBriefBlock, getDesignQuestion } from './sysdesign/bank.js';
import { getTechQuestion, techRoundBlock } from './techq/bank.js';
import { oopBriefBlock, getOopQuestion } from './oop/bank.js';
import { getCv } from './cv.js';
import { languageMeta } from '../../shared/languages';
import { profileBlock } from './profile.js';
import { INTERVIEWER_PROMPT } from './prompts/interviewer.js';
import { TUTOR_PROMPT } from './prompts/tutor.js';
import { mockPrompt } from './prompts/mock.js';
import { SYSDESIGN_PROMPT } from './prompts/sysdesign.js';
import { behavioralPrompt } from './prompts/behavioral.js';
import { TECHQ_PROMPT } from './prompts/techq.js';
import { OOP_PROMPT } from './prompts/oop.js';

// §6 — code is state, not history. With a persistent chat session the model's
// transcript accumulates turns we can't strip, so: the buffer is re-sent ONLY
// when it changed (or the session is fresh), always labeled as superseding
// every earlier copy; everything else (cursor, selection, build, tests) is
// small and rides along on every turn.

function numberLines(text: string): string {
  return text
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(4)}| ${line}`)
    .join('\n');
}

function lastLines(text: string, n: number): string {
  const lines = text.trimEnd().split('\n');
  return lines.slice(-n).join('\n');
}

function firstLines(text: string, n: number): string {
  const lines = text.trimEnd().split('\n');
  const head = lines.slice(0, n).join('\n');
  return lines.length > n ? `${head}\n[... ${lines.length - n} more lines of diagnostics]` : head;
}

// Active-clock timestamp: paused time is excluded, so a break the candidate
// took never shows up as a narration gap.
function clockIn(session: Session, at: number): string {
  const s = Math.round(activeMs(session, at) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Session-fixed prompt for the persistent chat session: persona + formatted
// problem + hidden brief (interviewer personas only). Changing persona or
// problem restarts the session with a fresh prompt.
function personaPromptFor(persona: Session['persona']): string {
  switch (persona) {
    case 'interviewer':
      return INTERVIEWER_PROMPT;
    case 'sysdesign':
      return SYSDESIGN_PROMPT;
    case 'behavioral':
      return behavioralPrompt();
    case 'mock':
      return mockPrompt();
    case 'tutor':
      return TUTOR_PROMPT;
    case 'techq':
      return TECHQ_PROMPT;
    case 'oopdesign':
      return OOP_PROMPT;
  }
}

export function buildSystemPrompt(session: Session): string {
  const blocks: string[] = [];
  blocks.push(personaPromptFor(session.persona));

  // The interviewer personas carry their own candidate context; the rest get
  // the profile here so the level bar is the same in every round type.
  if (session.persona !== 'tutor' && session.persona !== 'behavioral' && session.persona !== 'mock') {
    const profile = profileBlock();
    if (profile) blocks.push(profile);
  }

  // House style for every reply, in one place: the transcript reads like a
  // person typing in a chat window, not a model formatting a document.
  blocks.push(
    'STYLE: write plain text. No emoji, ever. No em dashes or en dashes anywhere: use a comma, a colon, or a second sentence instead. Keep formatting minimal; code goes in fenced blocks, everything else is prose.',
  );

  const meta = languageMeta(session.language);
  blocks.push(
    `SESSION LANGUAGE: the candidate is working in ${meta.label}. Judge idiomatic ${meta.label} — its standard library, its conventions, the abstractions a strong ${meta.label} engineer reaches for — at the same bar, and map any language-specific calibration in your instructions onto its ${meta.label} equivalent. Never suggest they switch languages.`,
  );

  // Sysdesign persona with a bank question active: inject its private ground
  // truth (requirements answer key, expected design, deep dives, level bars).
  if (session.persona === 'sysdesign' && session.designQuestionId) {
    const q = getDesignQuestion(session.designQuestionId);
    if (q) blocks.push(designBriefBlock(q));
  }

  // Tech-knowledge round: the sampled question set (answer keys + follow-up
  // ladders) is the interviewer's private ground truth.
  if (session.persona === 'techq' && session.techQuestionIds?.length) {
    const qs = session.techQuestionIds
      .map((id) => getTechQuestion(id))
      .filter((q): q is NonNullable<typeof q> => q !== undefined);
    if (qs.length) blocks.push(techRoundBlock(qs));
  }

  // OOP design round with a bank question active: mirror of the sysdesign
  // injection.
  if (session.persona === 'oopdesign' && session.oopQuestionId) {
    const q = getOopQuestion(session.oopQuestionId);
    if (q) blocks.push(oopBriefBlock(q));
  }

  // Behavioral and full-mock rounds: the uploaded CV, so the interviewer has
  // actually read the resume — real behavioral rounds are grounded in it.
  if (session.persona === 'behavioral' || session.persona === 'mock') {
    const cv = getCv();
    if (cv) {
      blocks.push(
        `CANDIDATE CV (uploaded by the candidate; extracted text, verbatim — you read this before the interview):\n${cv}\n\nGround your questions in the CV: pick real projects, roles and claims from it, and cross-examine specifics — dates, team sizes, "led" vs "we", metrics, gaps, anything vague or inflated — exactly like an interviewer who did their prep. Where the CV conflicts with the standing candidate context above, the CV wins.`,
      );
    }
  }

  const p = session.problem;
  if (p) {
    const examples = p.examples
      .map(
        (e, i) =>
          `Example ${i + 1}:\n  Input: ${e.input}\n  Output: ${e.output}${e.note ? `\n  Note: ${e.note}` : ''}`,
      )
      .join('\n');
    const facts = `Constraints:\n${p.constraints.map((c) => `- ${c}`).join('\n')}\n\n${examples}`;
    // The candidate sees ONLY the bare statement in their problem pane —
    // or nothing at all when delivery is oral.
    blocks.push(`# Problem: ${p.title}\n\n${p.statement}`);
    if (p.oral) {
      blocks.push(
        'ORAL DELIVERY: the candidate CANNOT see the problem text or title — you stated the problem aloud. Asking you to repeat or re-state part of it is normal phone-screen behaviour, not a weakness; when asked, repeat only what they asked for, in the same conversational register. Never paste the written statement.',
      );
    }
    if (session.persona === 'tutor') {
      // The tutor is transparent — full problem facts, no gatekeeping.
      blocks.push(facts);
    } else {
      // Interviewer personas hold the ground truth and release it one fact at
      // a time — discovering it is what Axis A scores.
      blocks.push(
        `PRIVATE PROBLEM FACTS — the candidate cannot see these and is expected to extract them by asking. Reveal ONLY the specific fact they ask for, one line at a time; never volunteer the rest, never enumerate. You may give an example only if they explicitly ask for one.\n\n${facts}`,
      );
      if (p.brief) {
        blocks.push(`PRIVATE INTERVIEWER BRIEF — never reveal or read out:\n${p.brief}`);
      }
    }
  }
  return blocks.join('\n\n');
}

// Sent per-turn while the client's voice mode is on (the persistent session's
// system prompt can't change mid-session, so this rides the user message).
const VOICE_STYLE = `<voice-mode>
Your reply will be read aloud by text-to-speech. Speak like a person on a phone screen: plain conversational sentences with contractions, usually 1-3 of them. No markdown structure at all — no headings, bullets, tables, or emphasis markers. No emoji. Vary your openers and skip filler like "Great" or "Sure". Say numbers, symbols and code the way you'd say them out loud: "big O of n log n", "ten to the fifth", "vector of int", "the loop around line twelve". Only include code when genuinely needed, inside a fenced code block — it is shown on screen but never read aloud, so refer to it as "the snippet on your screen". End questions cleanly so the candidate knows it's their turn.
</voice-mode>`;

/**
 * A mirror held up to the model's own last few replies.
 *
 * Two failure modes make an interviewer read as a bot, and both are mechanical
 * enough to measure: opening consecutive replies the same way, and replies
 * that keep growing until they are essays. Telling the model its own recent
 * openers and word counts fixes far more than another paragraph of style
 * instruction, because it is evidence rather than exhortation.
 */
function replyStyleNote(session: Session): string | null {
  const replies = session.turns.filter((t) => t.role === 'assistant').slice(-3);
  if (replies.length === 0) return null;

  const openers = replies.map((t) => t.content.trim().split(/\s+/).slice(0, 3).join(' ')).filter(Boolean);
  const words = replies.map((t) => t.content.trim().split(/\s+/).length);
  const longest = Math.max(...words);

  const notes: string[] = [];
  if (openers.length) notes.push(`Your last replies opened with: ${openers.map((o) => `"${o}..."`).join(', ')}. Do not open this one the same way.`);
  if (longest > 90) {
    notes.push(
      `Your recent replies ran to ${longest} words. An interviewer in a live round speaks in one to three sentences; cut this one back hard unless they asked for depth or you are debriefing.`,
    );
  }
  return `=== YOUR RECENT REGISTER ===\n${notes.join(' ')}`;
}

function buildLiveState(
  session: Session,
  latestEdit: EditSummary | null,
  includeBuffer: boolean,
  narration: NarrationSegment[],
): string {
  const parts: string[] = [];

  const lastPause = session.pauseSpans[session.pauseSpans.length - 1];
  if (lastPause && lastPause.to === null) {
    parts.push(
      '=== SESSION PAUSED === the candidate paused the session clock. This exchange is a break or coaching moment, not part of the timed interview — do not treat it as interview performance, and do not advance the mock until they resume.',
    );
  }

  if (includeBuffer) {
    parts.push(
      `=== CURRENT BUFFER (${languageMeta(session.language).label}, line-numbered, supersedes every earlier buffer in this conversation) ===\n${numberLines(session.buffer)}`,
    );
  } else {
    parts.push('=== BUFFER === unchanged since the last message');
  }

  if (session.selection && session.selection.text.trim()) {
    const { startLine, endLine, text } = session.selection;
    parts.push(`=== SELECTION (lines ${startLine}-${endLine}) ===\n${text}`);
  }

  parts.push(`=== CURSOR === line ${session.cursor.line}, column ${session.cursor.column}`);

  const style = replyStyleNote(session);
  if (style) parts.push(style);

  if (latestEdit) {
    parts.push(`=== SINCE LAST MESSAGE === ${latestEdit.summary}`);
  }

  if (narration.length > 0) {
    // Ambient think-aloud, transcribed while the candidate coded. Not a
    // message to the interviewer — shown so silence vs narration is visible.
    parts.push(
      `=== NARRATION (spoken aloud while coding since the last message — context, not addressed to you; do not answer it point-by-point) ===\n` +
        narration.map((n) => `[${clockIn(session, n.at)}] ${n.text}`).join('\n'),
    );
  }

  if (session.build.status === 'error' && session.build.stderr) {
    // Which end of a build failure matters depends on the language. A
    // compiler reports the FIRST error first, and everything after it is
    // usually fallout from that one; an interpreter puts the actual exception
    // at the END of the traceback. Showing the wrong end hands the
    // interviewer the least useful half of the message.
    const compiled = session.language === 'cpp' || session.language === 'java' || session.language === 'go' || session.language === 'rust';
    const diagnostics = compiled
      ? firstLines(session.build.stderr, 24)
      : lastLines(session.build.stderr, 20);
    let build = `=== BUILD === error\n${diagnostics}`;
    if (session.consecutiveBuildFailures >= 2) {
      build += `\n(the last ${session.consecutiveBuildFailures} builds failed with the same error)`;
    }
    parts.push(build);
  } else if (session.build.status === 'ok') {
    parts.push('=== BUILD === ok');
  }

  if (session.tests) {
    const t = session.tests;
    let tests = `=== TESTS === ${t.passed}/${t.total} passed`;
    if (t.failures.length) {
      tests +=
        '\n' +
        t.failures
          .map((f) => `case ${f.index}: input=${f.input}\n  expected: ${f.expected}\n  actual:   ${f.actual}`)
          .join('\n');
    }
    parts.push(tests);
  }

  return parts.join('\n\n');
}

// Replayed as the first turn of a freshly (re)started chat session, so a
// persona/problem switch or a crashed session doesn't lose the conversation.
// History with code stripped — edit markers preserve narrative continuity.
function buildHistory(session: Session): string | null {
  const parts: string[] = [];
  if (session.compactSummary) {
    parts.push(`Summary of the session so far:\n${session.compactSummary}`);
  }
  const editsByTurn = new Map<number, string>();
  for (const e of session.edits) editsByTurn.set(e.atTurn, e.summary);
  const narrationByTurn = new Map<number, NarrationSegment[]>();
  for (const n of session.narration) {
    const group = narrationByTurn.get(n.atTurn);
    if (group) group.push(n);
    else narrationByTurn.set(n.atTurn, [n]);
  }
  const lines: string[] = [];
  for (let i = session.compactedThrough; i < session.turns.length; i++) {
    // Think-aloud spoken before this turn, replayed in chronological place.
    for (const n of narrationByTurn.get(i) ?? []) {
      lines.push(`CANDIDATE (thinking aloud at ${clockIn(session, n.at)}, not addressed to you): ${n.text}`);
    }
    const turn = session.turns[i];
    let content = turn.content;
    if (turn.role === 'user' && editsByTurn.has(i)) {
      content = `[edit] ${editsByTurn.get(i)}\n\n${content}`;
    }
    lines.push(`${turn.role === 'user' ? 'CANDIDATE' : 'YOU'}: ${content}`);
  }
  if (lines.length) parts.push(lines.join('\n\n'));
  if (parts.length === 0) return null;
  return `<conversation-history>\nEarlier turns of this session, oldest first. Continue seamlessly as the assistant — do not greet again or recap.\n\n${parts.join('\n\n')}\n</conversation-history>`;
}

// One turn for the persistent chat session: optional history replay (fresh
// sessions only) + live editor state + optional voice styling + the message.
export function assembleTurn(
  session: Session,
  userMessage: string,
  latestEdit: EditSummary | null,
  opts: { voice: boolean; includeHistory: boolean; includeBuffer: boolean; narration: NarrationSegment[] },
): string {
  const parts: string[] = [];
  if (opts.includeHistory) {
    const history = buildHistory(session);
    if (history) parts.push(history);
  }
  parts.push(buildLiveState(session, latestEdit, opts.includeBuffer, opts.narration));
  if (opts.voice) parts.push(VOICE_STYLE);
  parts.push(`=== USER MESSAGE ===\n${userMessage}`);
  return parts.join('\n\n');
}
