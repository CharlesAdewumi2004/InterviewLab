// Browser-native voice layer: Web Speech API for input, speechSynthesis for
// output. No servers, no keys — everything runs in the browser.

// --- Speech recognition (input) ---------------------------------------------
// SpeechRecognition isn't in TypeScript's DOM lib; declare the slice we use.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition as RecognitionCtor) ?? (w.webkitSpeechRecognition as RecognitionCtor) ?? null;
}

export const speechInputSupported = recognitionCtor() !== null;

export interface MicSession {
  /** Stop listening; `onDone` fires with the final transcript. */
  stop(): void;
  /** Abandon without firing onDone (e.g. voice mode switched off). */
  abort(): void;
}

// One listening session. `onTranscript` fires continuously with the best
// current transcript (finalized + interim); `onDone` fires once after stop().
export function startMic(opts: {
  onTranscript: (text: string) => void;
  onDone: (finalText: string) => void;
  onError?: (message: string) => void;
}): MicSession | null {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    opts.onError?.('Speech input needs Chrome or Edge.');
    return null;
  }
  // Borrow the mic from any ambient narration capture for the duration —
  // the browser allows only one SpeechRecognition session at a time.
  const narration = activeNarration;
  narration?.hold();
  let released = false;
  const releaseNarration = () => {
    if (!released) {
      released = true;
      narration?.release();
    }
  };
  let finalized = '';
  let interim = '';
  let aborted = false;
  let stopped = false;
  let gotResult = false;
  let retried = false;
  let rec: Recognition | null = null;

  const finish = () => {
    releaseNarration();
    if (!aborted) opts.onDone((finalized + interim).trim());
  };

  const begin = (): boolean => {
    const r = new Ctor();
    r.lang = navigator.language || 'en-US';
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (ev) => {
      gotResult = true;
      interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) finalized += res[0].transcript;
        else interim += res[0].transcript;
      }
      opts.onTranscript((finalized + interim).trim());
    };
    r.onerror = (ev) => {
      // 'no-speech' and 'aborted' are routine; only surface real failures.
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        opts.onError?.(
          ev.error === 'not-allowed'
            ? 'Microphone access was denied, allow it in the browser address bar.'
            : `Speech input error: ${ev.error}`,
        );
      }
    };
    r.onend = () => {
      // A recognizer can die instantly while the mic is being handed over
      // from ambient narration (abort → start race) — retry once, silently,
      // before treating the session as finished.
      if (!aborted && !stopped && !gotResult && !retried) {
        retried = true;
        setTimeout(() => {
          if (aborted || stopped) {
            finish(); // the user ended the session while we waited
            return;
          }
          if (!begin()) finish();
        }, 150);
        return;
      }
      finish();
    };

    try {
      r.start();
    } catch {
      return false;
    }
    rec = r;
    return true;
  };

  if (!begin()) {
    releaseNarration();
    opts.onError?.('Could not start the microphone.');
    return null;
  }
  return {
    stop: () => {
      stopped = true;
      rec?.stop();
    },
    abort: () => {
      aborted = true;
      rec?.abort();
    },
  };
}

// --- Ambient narration (continuous think-aloud capture) ----------------------
// One always-listening recognition loop, independent of the turn-based mic
// above: what it hears is narration context and grading evidence, never a chat
// message. Browsers end continuous recognition after a stretch of silence, so
// it restarts itself until stop(). It yields the mic while the interviewer's
// TTS is speaking (an open mic would transcribe the reply) and while a
// startMic session (push-to-talk / click-to-talk) is active.

let activeNarration: NarrationCapture | null = null;

export class NarrationCapture {
  private rec: Recognition | null = null;
  private running = false;
  private holds = 0; // startMic sessions currently borrowing the mic
  private pausedByTts = false;
  private ttsPoll: ReturnType<typeof setInterval> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartDelay = 400;

  constructor(
    private opts: {
      /** A finalized utterance — fires once per spoken chunk. */
      onSegment: (text: string) => void;
      /** Live best-guess of the in-progress utterance ('' when idle). */
      onInterim?: (text: string) => void;
      /** True while actually capturing; false while yielded (TTS/PTT) or stopped. */
      onStatus?: (listening: boolean) => void;
      /** Unrecoverable failure (mic denied, no support) — capture has stopped. */
      onError?: (message: string) => void;
    },
  ) {}

  /** Returns false when speech input is unsupported. */
  start(): boolean {
    if (this.running) return true;
    if (!recognitionCtor()) {
      this.opts.onError?.('Speech input needs Chrome or Edge.');
      return false;
    }
    activeNarration?.stop();
    activeNarration = this;
    this.running = true;
    // speechSynthesis has no reliable cross-browser start/end events once
    // cancel() gets involved — poll instead.
    this.ttsPoll = setInterval(() => {
      const speaking = 'speechSynthesis' in window && speechSynthesis.speaking;
      if (speaking && !this.pausedByTts) {
        this.pausedByTts = true;
        this.drop();
      } else if (!speaking && this.pausedByTts) {
        this.pausedByTts = false;
        this.listen();
      }
    }, 250);
    this.listen();
    return true;
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (activeNarration === this) activeNarration = null;
    if (this.ttsPoll) clearInterval(this.ttsPoll);
    this.ttsPoll = null;
    this.drop();
  }

  /** startMic needs the recognizer — yield until release(). */
  hold(): void {
    this.holds++;
    this.drop();
  }

  release(): void {
    this.holds = Math.max(0, this.holds - 1);
    if (this.holds === 0) this.listen();
  }

  private get shouldListen(): boolean {
    return this.running && this.holds === 0 && !this.pausedByTts;
  }

  private drop(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      rec.abort();
    }
    this.opts.onInterim?.('');
    this.opts.onStatus?.(false);
  }

  private scheduleRestart(): void {
    if (this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.listen();
    }, this.restartDelay);
  }

  private listen(): void {
    if (!this.shouldListen || this.rec || this.restartTimer) return;
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (ev) => {
      this.restartDelay = 400; // audio is flowing, reset any error backoff
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (text) this.opts.onSegment(text);
        } else {
          interim += r[0].transcript;
        }
      }
      this.opts.onInterim?.(interim.trim());
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        this.stop();
        this.opts.onError?.('Microphone access was denied, allow it in the browser address bar.');
      } else if (ev.error === 'network') {
        this.restartDelay = Math.min(this.restartDelay * 2, 5000); // don't hammer a broken service
      }
      // 'no-speech' and 'aborted' are routine — onend handles the restart
    };
    rec.onend = () => {
      if (this.rec === rec) this.rec = null;
      this.opts.onInterim?.('');
      if (this.shouldListen) this.scheduleRestart();
    };

    try {
      rec.start();
      this.rec = rec;
      this.opts.onStatus?.(true);
    } catch {
      // start() can throw while another recognizer is winding down — retry.
      this.scheduleRestart();
    }
  }
}

// --- Speech synthesis (output) ----------------------------------------------

// Voice quality varies wildly: Edge exposes Microsoft's neural "Natural"
// voices (best), Chrome has Google network voices (okay) and old SAPI voices
// (robotic). Rank what's available and let the user override via the picker.
function voiceScore(v: SpeechSynthesisVoice): number {
  if (/natural/i.test(v.name)) return 4; // Edge neural, e.g. "Microsoft Sonia Online (Natural)"
  if (/neural|premium|enhanced/i.test(v.name)) return 3;
  if (/google/i.test(v.name)) return 2;
  return 1; // legacy SAPI (David/Zira) and everything else
}

export function listEnglishVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
}

/** Re-fires when the browser's async voice list loads/changes. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!('speechSynthesis' in window)) return () => {};
  speechSynthesis.addEventListener('voiceschanged', cb);
  return () => speechSynthesis.removeEventListener('voiceschanged', cb);
}

const PREF_KEY = 'practice-ide:tts-voice';
let cachedVoice: SpeechSynthesisVoice | null | undefined;

export function getPreferredVoiceName(): string | null {
  return localStorage.getItem(PREF_KEY);
}

export function setPreferredVoice(name: string | null): void {
  if (name) localStorage.setItem(PREF_KEY, name);
  else localStorage.removeItem(PREF_KEY);
  cachedVoice = undefined;
}

/** Speak a short line with the current voice so a picker choice is auditable. */
export function speakSample(): void {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(
    'Hi, this is how your interviewer will sound. Ready when you are.',
  );
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const en = listEnglishVoices();
  if (en.length === 0) return null; // not loaded yet, retry next utterance
  const preferred = getPreferredVoiceName();
  cachedVoice = (preferred && en.find((v) => v.name === preferred)) || en[0];
  return cachedVoice;
}
if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener('voiceschanged', () => {
    cachedVoice = undefined;
  });
}

// Make streamed markdown speakable: drop formatting characters, never speak
// code. Called on sentence-sized chunks that are already fence-free.
function speakable(text: string): string {
  return text
    .replace(/`[^`]*`/g, ' the snippet on screen ')
    .replace(/[*_#|>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Accumulates streamed deltas, extracts complete sentences (skipping fenced
// code entirely), and queues each sentence into speechSynthesis as soon as it
// completes — so speech starts after the first sentence, not the full reply.
export class SentenceSpeaker {
  private buffer = '';
  private inCode = false;
  private stopped = false;
  // Micro-sentences ("Right.", "Okay.") spoken as separate utterances make
  // even good voices sound robotic — hold them and merge into the next
  // sentence so each utterance has enough text for natural prosody.
  private pendingSpeech = '';

  /** Call when a new reply starts streaming — clears any barge-in stop. */
  beginReply(): void {
    speechSynthesis.cancel();
    this.buffer = '';
    this.inCode = false;
    this.stopped = false;
    this.pendingSpeech = '';
  }

  feed(delta: string): void {
    if (this.stopped) return; // barged-in: stay quiet until the next reply
    this.buffer += delta;
    this.drain(false);
  }

  /** Flush whatever is left once the reply is complete. */
  finish(): void {
    this.drain(true);
    this.flushSpeech();
    this.buffer = '';
    this.inCode = false;
  }

  /** Barge-in: stop speaking now and forget any pending text. */
  cancel(): void {
    this.stopped = true;
    this.buffer = '';
    this.inCode = false;
    this.pendingSpeech = '';
    speechSynthesis.cancel();
  }

  private drain(flush: boolean): void {
    // Alternate between prose and code segments on ``` boundaries.
    for (;;) {
      const fence = this.buffer.indexOf('```');
      if (this.inCode) {
        if (fence === -1) return; // code still streaming, speak nothing
        this.buffer = this.buffer.slice(fence + 3);
        this.inCode = false;
        continue;
      }
      const prose = fence === -1 ? this.buffer : this.buffer.slice(0, fence);
      const emitted = this.emitSentences(prose, flush && fence === -1);
      if (fence === -1) {
        this.buffer = prose.slice(emitted);
        return;
      }
      this.speak(prose.slice(emitted)); // sentence cut off by a code block
      this.buffer = this.buffer.slice(fence + 3);
      this.inCode = true;
    }
  }

  // Speak every complete sentence in `text`; returns how much was consumed.
  private emitSentences(text: string, flushAll: boolean): number {
    let consumed = 0;
    const re = /[.!?](?=[\s"')\]]|$)[\s"')\]]*|\n+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // Don't split on '.' that is likely mid-identifier (e.g. "vec.size"):
      // require whitespace/EOL after the terminator, which the regex enforces,
      // and skip if the "sentence" is only a couple of characters.
      const end = m.index + m[0].length;
      if (end < text.length || /[\s"')\]]$/.test(m[0]) || m[0].includes('\n') || flushAll) {
        this.speak(text.slice(consumed, end));
        consumed = end;
      }
    }
    if (flushAll && consumed < text.length) {
      this.speak(text.slice(consumed));
      consumed = text.length;
    }
    return consumed;
  }

  private speak(chunk: string): void {
    if (this.stopped) return;
    const text = speakable(chunk);
    if (!text) return;
    this.pendingSpeech = this.pendingSpeech ? `${this.pendingSpeech} ${text}` : text;
    if (this.pendingSpeech.length >= 24) this.flushSpeech(); // else: merge with the next sentence
  }

  private flushSpeech(): void {
    if (this.stopped || !this.pendingSpeech) return;
    const u = new SpeechSynthesisUtterance(this.pendingSpeech);
    this.pendingSpeech = '';
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = 1.05;
    speechSynthesis.speak(u); // enqueues; utterances play back-to-back
  }
}
