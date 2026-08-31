/**
 * Mic-driven dictation backed by server-side transcription (OpenAI), since
 * browser Web Speech API has no reliable support for Yorùbá, Igbo, Hausa or
 * Nigerian Pidgin. Records continuously (does not auto-stop) by chaining
 * short MediaRecorder segments on one mic stream; each finished segment is
 * sent off for transcription while the next segment starts recording.
 */
import { SPEECH_LOCALES } from "./joji";

const CHUNK_MS = 4000;
const MIN_CHUNK_BYTES = 800;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function speechRecognitionSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

export function speechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

type DictationOptions = {
  lang: string;
  transcribe: (audio: Blob, lang: string) => Promise<string>;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

type DictationState = {
  stopped: boolean;
  recorder: MediaRecorder | null;
  timer: ReturnType<typeof setTimeout> | undefined;
};

function recordSegment(stream: MediaStream, opts: DictationOptions, state: DictationState) {
  if (state.stopped) {
    stream.getTracks().forEach((track) => track.stop());
    opts.onEnd?.();
    return;
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  state.recorder = recorder;
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    if (blob.size >= MIN_CHUNK_BYTES) {
      opts.onInterim?.("Transcribing…");
      opts
        .transcribe(blob, opts.lang)
        .then((text) => {
          const trimmed = text.trim();
          if (trimmed) opts.onFinal(trimmed);
        })
        .catch((error: unknown) => {
          opts.onError?.(error instanceof Error ? error.message : "Voice transcription failed.");
        })
        .finally(() => opts.onInterim?.(""));
    }
    recordSegment(stream, opts, state);
  };

  recorder.start();
  state.timer = setTimeout(() => {
    try {
      recorder.stop();
    } catch {
      /* already stopped */
    }
  }, CHUNK_MS);
}

/**
 * Starts continuous dictation and returns a stop handle. Recording keeps
 * going — chunk after chunk — until the returned function is called; it
 * never auto-stops on silence.
 */
export function startDictation(opts: DictationOptions) {
  const state: DictationState = { stopped: false, recorder: null, timer: undefined };

  if (!speechRecognitionSupported()) {
    opts.onError?.("Voice input is not supported in this browser. Please type instead.");
    opts.onEnd?.();
    return () => {};
  }

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      if (state.stopped) {
        stream.getTracks().forEach((track) => track.stop());
        opts.onEnd?.();
        return;
      }
      recordSegment(stream, opts, state);
    })
    .catch(() => {
      opts.onError?.("Microphone access was blocked. Enable it in your browser settings.");
      opts.onEnd?.();
    });

  return () => {
    state.stopped = true;
    clearTimeout(state.timer);
    try {
      state.recorder?.stop();
    } catch {
      /* already stopped */
    }
  };
}

export function speak(text: string, lang: string) {
  if (!speechSynthesisSupported()) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_LOCALES[lang] ?? "en-NG";
  utterance.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}
