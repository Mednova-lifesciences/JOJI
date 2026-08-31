import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Languages,
  Loader2,
  Mic,
  MicOff,
  Send,
  Siren,
  Volume2,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { translateText } from "@/lib/ai.functions";
import { detectEmergency, LANGUAGE_NAMES, PATIENT_LANGUAGES } from "@/lib/joji";
import { startDictation, speak, speechRecognitionSupported } from "@/lib/speech";
import { takeTranslatePrefill } from "@/lib/translate-prefill";
import { WorkspaceHeader } from "./workspace-header";

type Message = {
  id: number;
  side: "patient" | "doctor";
  text: string;
  translated?: string;
  lang: string;
};

const starterMessages: Message[] = [
  {
    id: 1,
    side: "patient",
    text: "Orí mi ń fọ́, ara mi sì gbóná láti àná.",
    translated: "I have a headache and I've had a fever since yesterday.",
    lang: "yo",
  },
  {
    id: 2,
    side: "doctor",
    text: "We'll run a malaria test now. Have you eaten today?",
    translated: "A máa ṣe àyẹ̀wò ibà fún ọ báyìí. Ṣé o ti jẹun lónìí?",
    lang: "en",
  },
];

export function TranslatePage() {
  const translate = useServerFn(translateText);
  const [language, setLanguage] = useState("yo");
  const [messages, setMessages] = useState(starterMessages);
  const [patientDraft, setPatientDraft] = useState("");
  const [doctorDraft, setDoctorDraft] = useState("");
  const [busy, setBusy] = useState<"patient" | "doctor" | null>(null);
  const [listening, setListening] = useState<"patient" | "doctor" | null>(null);
  const [interim, setInterim] = useState("");
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const prefill = takeTranslatePrefill();
    if (prefill) setPatientDraft(prefill);
  }, []);

  const patientName = LANGUAGE_NAMES[language] ?? language;

  async function send(side: "patient" | "doctor", draft?: string) {
    const text = (draft ?? (side === "patient" ? patientDraft : doctorDraft)).trim();
    if (!text || busy) return;
    if (side === "patient") setPatientDraft("");
    else setDoctorDraft("");
    const id = Date.now();
    setMessages((current) => [
      ...current,
      { id, side, text, lang: side === "patient" ? language : "en" },
    ]);
    setBusy(side);
    try {
      const result = await translate({
        data: {
          text,
          fromLang: side === "patient" ? language : "en",
          toLang: side === "patient" ? "en" : language,
        },
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === id ? { ...message, translated: result.translation } : message,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Translation failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function toggleDictation(side: "patient" | "doctor") {
    if (listening) {
      stopRef.current?.();
      setListening(null);
      return;
    }
    if (!speechRecognitionSupported()) {
      toast.error("Voice input is not supported in this browser. Please type instead.");
      return;
    }
    setListening(side);
    stopRef.current = startDictation({
      lang: side === "patient" ? language : "en",
      onInterim: setInterim,
      onFinal: (text) => {
        setInterim("");
        void send(side, text);
      },
      onError: (message) => toast.error(message),
      onEnd: () => {
        setListening(null);
        setInterim("");
      },
    });
  }

  return (
    <div className="min-h-screen">
      <WorkspaceHeader
        eyebrow="Translate / Live consultation"
        title="Speak clearly. Care confidently."
        description="A live bilingual room for patient–doctor conversations. Type or use your microphone; JOJI keeps both sides in sync."
        action={
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            <Wifi className="size-3.5 text-emerald" /> Local room active
          </div>
        }
      />

      <div className="space-y-6 px-5 py-6 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-secondary text-teal">
              <Languages className="size-4" />
            </span>
            <div>
              <p className="label-mono text-muted-foreground">Active language pair</p>
              <p className="font-medium">
                {patientName} <ArrowRight className="mx-1 inline size-3.5 text-teal" /> English
              </p>
            </div>
          </div>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PATIENT_LANGUAGES.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {messages.some((message) => detectEmergency(message.text)) && (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            <Siren className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">Possible emergency detected</p>
              <p className="mt-1 text-sm">
                This may be an emergency. Please call 112 or seek immediate care.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-2">
          <ConversationPanel
            side="patient"
            language={patientName}
            messages={messages}
            draft={patientDraft}
            setDraft={setPatientDraft}
            busy={busy === "patient"}
            listening={listening === "patient"}
            interim={interim}
            onSend={() => void send("patient")}
            onMic={() => toggleDictation("patient")}
          />
          <ConversationPanel
            side="doctor"
            language="English"
            messages={messages}
            draft={doctorDraft}
            setDraft={setDoctorDraft}
            busy={busy === "doctor"}
            listening={listening === "doctor"}
            interim={interim}
            onSend={() => void send("doctor")}
            onMic={() => toggleDictation("doctor")}
          />
        </div>
        <p className="label-mono text-center text-muted-foreground">
          AI-assisted translation · Review clinical meaning before acting
        </p>
      </div>
    </div>
  );
}

function ConversationPanel({
  side,
  language,
  messages,
  draft,
  setDraft,
  busy,
  listening,
  interim,
  onSend,
  onMic,
}: {
  side: "patient" | "doctor";
  language: string;
  messages: Message[];
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  listening: boolean;
  interim: string;
  onSend: () => void;
  onMic: () => void;
}) {
  const isPatient = side === "patient";
  return (
    <section className="surface flex min-h-[34rem] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-secondary/45 px-5 py-4">
        <div>
          <p className="label-mono text-muted-foreground">
            {isPatient ? "Patient side" : "Doctor side"}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{language}</h2>
        </div>
        <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          {isPatient ? "Input language" : "Locked language"}
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-paper-soft/35 p-5">
        {messages.map((message) => {
          const visible = message.side === side ? message.text : message.translated;
          if (!visible) return null;
          return (
            <MessageBubble
              key={`${message.id}-${side}`}
              text={visible}
              mine={message.side === side}
              lang={message.side === side ? message.lang : isPatient ? "yo" : "en"}
            />
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Translating securely…
          </div>
        )}
        {listening && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <span className="size-2 animate-pulse rounded-full bg-destructive" /> Listening
            {interim ? ` — ${interim}` : "…"}
          </div>
        )}
      </div>
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={isPatient ? `Type in ${language}…` : "Type in English…"}
            className="min-h-12 resize-none"
            aria-label={`${language} message`}
          />
          <div className="flex flex-col gap-2">
            <Button
              size="icon"
              variant={listening ? "destructive" : "outline"}
              onClick={onMic}
              aria-label={listening ? "Stop listening" : "Start voice input"}
            >
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
            <Button
              size="icon"
              onClick={onSend}
              disabled={busy || !draft.trim()}
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Press Enter to send · Microphone uses your browser's speech recognition
        </p>
      </div>
    </section>
  );
}

function MessageBubble({ text, mine, lang }: { text: string; mine: boolean; lang: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl p-3.5 ${mine ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border border-border bg-card"}`}
      >
        <p
          className={`label-mono ${mine ? "text-primary-foreground/65" : "text-muted-foreground"}`}
        >
          {LANGUAGE_NAMES[lang] ?? lang}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">{text}</p>
        <div className={`mt-2 flex gap-1 ${mine ? "justify-end" : "justify-start"}`}>
          <Button
            variant="ghost"
            size="icon"
            className={`size-7 ${mine ? "text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => speak(text, lang)}
            aria-label="Read message aloud"
          >
            <Volume2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`size-7 ${mine ? "text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => void copy()}
            aria-label="Copy message"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
