import { supabase } from "./supabase";

export type Conversation = {
  id: string;
  title: string;
  patientLanguage: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  side: "patient" | "doctor";
  originalText: string;
  translatedText: string | null;
  lang: string;
  createdBy: string;
  createdAt: string;
};

type ConversationRow = {
  id: string;
  title: string;
  patient_language: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  side: "patient" | "doctor";
  original_text: string;
  translated_text: string | null;
  lang: string;
  created_by: string;
  created_at: string;
};

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    patientLanguage: row.patient_language,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    side: row.side,
    originalText: row.original_text,
    translatedText: row.translated_text,
    lang: row.lang,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, patient_language, created_by, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ConversationRow[]).map(toConversation);
}

export async function createConversation(input: {
  title: string;
  patientLanguage: string;
  createdBy: string;
}): Promise<Conversation> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      title: input.title,
      patient_language: input.patientLanguage,
      created_by: input.createdBy,
    })
    .select("id, title, patient_language, created_by, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return toConversation(data as ConversationRow);
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listMessages(conversationId: string): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, side, original_text, translated_text, lang, created_by, created_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MessageRow[]).map(toMessage);
}

export async function insertMessage(input: {
  conversationId: string;
  side: "patient" | "doctor";
  originalText: string;
  lang: string;
  createdBy: string;
}): Promise<ConversationMessage> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      side: input.side,
      original_text: input.originalText,
      lang: input.lang,
      created_by: input.createdBy,
    })
    .select(
      "id, conversation_id, side, original_text, translated_text, lang, created_by, created_at",
    )
    .single();
  if (error) throw new Error(error.message);
  return toMessage(data as MessageRow);
}

export async function updateMessageTranslation(id: string, translatedText: string): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ translated_text: translatedText })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export function subscribeToConversationMessages(
  conversationId: string,
  onChange: (message: ConversationMessage) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onChange(toMessage(payload.new as MessageRow)),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onChange(toMessage(payload.new as MessageRow)),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onConnectionChange?.(true);
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        onConnectionChange?.(false);
      }
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}
