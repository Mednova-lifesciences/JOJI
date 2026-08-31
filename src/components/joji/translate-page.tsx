import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  History,
  Languages,
  Loader2,
  Maximize2,
  MessageSquareQuote,
  Mic,
  MicOff,
  Minimize2,
  Plus,
  Send,
  Siren,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import {
  createConversation,
  deleteConversation,
  insertMessage,
  listConversations,
  listMessages,
  subscribeToConversationMessages,
  updateMessageTranslation,
  type Conversation,
  type ConversationMessage,
} from "@/lib/conversations";
import { transcribeAudio, translateText } from "@/lib/ai.functions";
import { detectEmergency, formatDateTime, LANGUAGE_NAMES, PATIENT_LANGUAGES } from "@/lib/joji";
import { startDictation, speak, speechRecognitionSupported } from "@/lib/speech";
import { takeTranslatePrefill } from "@/lib/translate-prefill";
import { cn } from "@/lib/utils";
import { WorkspaceHeader } from "./workspace-header";

export function TranslatePage() {
  const { user } = useAuth();
  const translate = useServerFn(translateText);
  const transcribe = useServerFn(transcribeAudio);
  const [language, setLanguage] = useState("yo");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [patientDraft, setPatientDraft] = useState("");
  const [doctorDraft, setDoctorDraft] = useState("");
  const [busy, setBusy] = useState<"patient" | "doctor" | null>(null);
  const [listening, setListening] = useState<"patient" | "doctor" | null>(null);
  const [interim, setInterim] = useState("");
  const [layout, setLayout] = useState<"split" | "patient" | "doctor">("split");
  const stopDictationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const prefill = takeTranslatePrefill();
    if (prefill) setPatientDraft(prefill);
  }, []);

  useEffect(() => {
    let active = true;
    listConversations()
      .then((rows) => {
        if (active) setConversations(rows);
      })
      .catch((error: unknown) => {
        if (active) toast.error(error instanceof Error ? error.message : "Could not load chats.");
      })
      .finally(() => {
        if (active) setConversationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeConversation) return;
    let reconnectToastShown = false;
    let torndown = false;
    const unsubscribe = subscribeToConversationMessages(
      activeConversation.id,
      (incoming) => {
        setMessages((current) => {
          const index = current.findIndex((message) => message.id === incoming.id);
          if (index === -1) return [...current, incoming];
          const next = [...current];
          next[index] = incoming;
          return next;
        });
      },
      (connected) => {
        if (torndown) return;
        if (!connected) {
          reconnectToastShown = true;
          toast.error("Live sync lost — reconnecting…", { id: "realtime-status" });
        } else if (reconnectToastShown) {
          reconnectToastShown = false;
          toast.success("Live sync restored", { id: "realtime-status" });
        }
      },
    );
    return () => {
      torndown = true;
      unsubscribe();
    };
  }, [activeConversation]);

  const patientName = LANGUAGE_NAMES[language] ?? language;

  async function openConversation(conversation: Conversation) {
    stopDictationRef.current?.();
    setListening(null);
    setInterim("");
    setActiveConversation(conversation);
    setLanguage(conversation.patientLanguage);
    setMessages([]);
    setHistoryOpen(false);
    try {
      const rows = await listMessages(conversation.id);
      setMessages(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load this chat.");
    }
  }

  async function handleCreateChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    stopDictationRef.current?.();
    setListening(null);
    setInterim("");
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) return;
    setCreatingChat(true);
    try {
      const conversation = await createConversation({
        title,
        patientLanguage: language,
        createdBy: user.id,
      });
      setConversations((current) => [conversation, ...current]);
      setActiveConversation(conversation);
      setMessages([]);
      setNewChatOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start a new chat.");
    } finally {
      setCreatingChat(false);
    }
  }

  async function handleDeleteConversation(id: string) {
    try {
      await deleteConversation(id);
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      if (activeConversation?.id === id) {
        stopDictationRef.current?.();
        setListening(null);
        setInterim("");
        setActiveConversation(null);
        setMessages([]);
      }
      toast.success("Chat deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this chat.");
    }
  }

  async function send(side: "patient" | "doctor", draft?: string) {
    if (!activeConversation || !user) return;
    const text = (draft ?? (side === "patient" ? patientDraft : doctorDraft)).trim();
    if (!text || busy) return;
    setBusy(side);
    try {
      const inserted = await insertMessage({
        conversationId: activeConversation.id,
        side,
        originalText: text,
        lang: side === "patient" ? language : "en",
        createdBy: user.id,
      });
      if (side === "patient") setPatientDraft("");
      else setDoctorDraft("");
      setMessages((current) => [...current, inserted]);
      const result = await translate({
        data: {
          text,
          fromLang: side === "patient" ? language : "en",
          toLang: side === "patient" ? "en" : language,
        },
      });
      await updateMessageTranslation(inserted.id, result.translation);
      setMessages((current) =>
        current.map((message) =>
          message.id === inserted.id ? { ...message, translatedText: result.translation } : message,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Translation failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  function toggleDictation(side: "patient" | "doctor") {
    if (!activeConversation) {
      toast.error("Start a new chat first.");
      return;
    }
    if (listening) {
      stopDictationRef.current?.();
      setListening(null);
      return;
    }
    if (!speechRecognitionSupported()) {
      toast.error("Voice input is not supported in this browser. Please type instead.");
      return;
    }
    setListening(side);
    stopDictationRef.current = startDictation({
      lang: side === "patient" ? language : "en",
      transcribe: async (audio, lang) => {
        const form = new FormData();
        form.append("audio", audio, "chunk.webm");
        form.append("lang", lang);
        const result = await transcribe({ data: form });
        return result.text;
      },
      onInterim: setInterim,
      onFinal: (text) => {
        setInterim("");
        void sendRef.current(side, text);
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
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" /> History
            </Button>
            <Button onClick={() => setNewChatOpen(true)}>
              <Plus className="size-4" /> New chat
            </Button>
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

        {messages.some((message) => detectEmergency(message.originalText)) && (
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

        {activeConversation ? (
          <div className={cn("grid gap-5", layout === "split" && "xl:grid-cols-2")}>
            {(layout === "split" || layout === "patient") && (
              <ConversationPanel
                side="patient"
                language={patientName}
                messages={messages}
                draft={patientDraft}
                setDraft={setPatientDraft}
                busy={busy === "patient"}
                listening={listening === "patient"}
                interim={interim}
                disabled={false}
                maximized={layout === "patient"}
                onSend={() => void send("patient")}
                onMic={() => toggleDictation("patient")}
                onMaximize={() => setLayout("patient")}
                onRestore={() => setLayout("split")}
              />
            )}
            {(layout === "split" || layout === "doctor") && (
              <ConversationPanel
                side="doctor"
                language="English"
                messages={messages}
                draft={doctorDraft}
                setDraft={setDoctorDraft}
                busy={busy === "doctor"}
                listening={listening === "doctor"}
                interim={interim}
                disabled={false}
                maximized={layout === "doctor"}
                onSend={() => void send("doctor")}
                onMic={() => toggleDictation("doctor")}
                onMaximize={() => setLayout("doctor")}
                onRestore={() => setLayout("split")}
              />
            )}
          </div>
        ) : (
          <div className="surface flex min-h-[34rem] flex-col items-center justify-center gap-4 p-10 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-teal">
              <MessageSquareQuote className="size-6" />
            </span>
            <div>
              <h2 className="text-xl font-semibold">No chat open</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a new chat or open one from your history.
              </p>
            </div>
            <Button onClick={() => setNewChatOpen(true)}>
              <Plus className="size-4" /> New chat
            </Button>
          </div>
        )}
        <p className="label-mono text-center text-muted-foreground">
          AI-assisted translation · Review clinical meaning before acting
        </p>
      </div>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new chat</DialogTitle>
            <DialogDescription>
              Give this consultation a patient name or reference so you can find it again.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateChat} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chat-title">Patient name or reference</Label>
              <Input id="chat-title" name="title" required placeholder="e.g. Mrs. Adebayo" />
            </div>
            <Button type="submit" className="w-full" disabled={creatingChat}>
              {creatingChat && <Loader2 className="size-4 animate-spin" />} Start chat
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="flex w-full flex-col sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Chat history</SheetTitle>
            <SheetDescription>Conversations saved by your organisation.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
            {conversationsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!conversationsLoading && conversations.length === 0 && (
              <p className="text-sm text-muted-foreground">No saved chats yet.</p>
            )}
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group flex items-center justify-between gap-2 rounded-xl border border-border p-3 hover:bg-secondary/60",
                  activeConversation?.id === conversation.id && "border-teal bg-secondary/60",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => void openConversation(conversation)}
                >
                  <p className="truncate text-sm font-medium">{conversation.title}</p>
                  <p className="label-mono text-muted-foreground">
                    {formatDateTime(conversation.updatedAt)}
                  </p>
                </button>
                {conversation.createdBy === user?.id && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
                        aria-label="Delete chat"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                        <AlertDialogDescription>
                          &quot;{conversation.title}&quot; and its messages will be permanently
                          deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => void handleDeleteConversation(conversation.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
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
  disabled,
  maximized,
  onSend,
  onMic,
  onMaximize,
  onRestore,
}: {
  side: "patient" | "doctor";
  language: string;
  messages: ConversationMessage[];
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  listening: boolean;
  interim: string;
  disabled: boolean;
  maximized: boolean;
  onSend: () => void;
  onMic: () => void;
  onMaximize: () => void;
  onRestore: () => void;
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
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {isPatient ? "Input language" : "Locked language"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={maximized ? onRestore : onMaximize}
            aria-label={maximized ? "Restore split view" : `Maximize ${side} side`}
          >
            {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-paper-soft/35 p-5">
        {messages.map((message) => {
          const visible = message.side === side ? message.originalText : message.translatedText;
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
            placeholder={
              disabled
                ? "Start a new chat to begin…"
                : isPatient
                  ? `Type in ${language}…`
                  : "Type in English…"
            }
            className="min-h-12 resize-none"
            aria-label={`${language} message`}
            disabled={disabled}
          />
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              {listening && (
                <span className="absolute inset-0 animate-ping rounded-full bg-destructive/60" />
              )}
              <Button
                size="icon"
                variant={listening ? "destructive" : "outline"}
                onClick={onMic}
                disabled={disabled}
                aria-label={listening ? "Stop listening" : "Start voice input"}
                className={cn("relative size-14 rounded-full", listening && "animate-pulse")}
              >
                {listening ? <MicOff className="size-6" /> : <Mic className="size-6" />}
              </Button>
            </div>
            <Button
              size="icon"
              onClick={onSend}
              disabled={disabled || busy || !draft.trim()}
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
