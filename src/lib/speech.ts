/**
 * Thin wrappers over the native Web Speech API with graceful degradation.
 */
import { SPEECH_LOCALES } from "./joji";

type SpeechResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechResultEvent = { resultIndex: number; results: ArrayLike<SpeechResultLike> };
type SpeechErrorEvent = { error?: string };
type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function speechRecognitionSupported() {
  return getRecognitionCtor() !== null;
}

export function speechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Starts dictation and returns a stop handle.
 * NOTE: browser STT is used here. To route audio through Google Chirp 3 instead,
 * capture the mic with MediaRecorder and POST the blob to a server function that
 * calls your STT provider, then feed the transcript into the same callbacks.
 */
export function startDictation(opts: {
  lang: string;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    opts.onError?.("Voice input is not supported in this browser. Please type instead.");
    opts.onEnd?.();
    return () => {};
  }

  const recognition = new Ctor();
  recognition.lang = SPEECH_LOCALES[opts.lang] ?? "en-NG";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event: SpeechResultEvent) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) opts.onFinal(String(result[0].transcript).trim());
      else interim += result[0].transcript;
    }
    if (interim) opts.onInterim?.(interim);
  };
  recognition.onerror = (event: SpeechErrorEvent) => {
    const code = event.error ?? "unknown";
    opts.onError?.(
      code === "not-allowed"
        ? "Microphone access was blocked. Enable it in your browser settings."
        : code === "no-speech"
          ? "No speech was detected. Try again."
          : "Voice capture failed. Please type instead.",
    );
  };
  recognition.onend = () => opts.onEnd?.();

  try {
    recognition.start();
  } catch {
    opts.onError?.("Could not start the microphone.");
    opts.onEnd?.();
  }

  return () => {
    try {
      recognition.stop();
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
