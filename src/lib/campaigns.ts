import { supabase } from "./supabase";
import type { CampaignKit } from "./ai.types";

export type SavedCampaign = {
  id: string;
  title: string;
  sourceText: string;
  topic: string | null;
  audience: string | null;
  kit: CampaignKit;
  createdBy: string;
  createdAt: string;
};

type CampaignRow = {
  id: string;
  title: string;
  source_text: string;
  topic: string | null;
  audience: string | null;
  kit: CampaignKit;
  created_by: string;
  created_at: string;
};

function toSavedCampaign(row: CampaignRow): SavedCampaign {
  return {
    id: row.id,
    title: row.title,
    sourceText: row.source_text,
    topic: row.topic,
    audience: row.audience,
    kit: row.kit,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listCampaigns(): Promise<SavedCampaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, title, source_text, topic, audience, kit, created_by, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CampaignRow[]).map(toSavedCampaign);
}

export async function saveCampaign(input: {
  sourceText: string;
  topic?: string;
  audience?: string;
  kit: CampaignKit;
  createdBy: string;
}): Promise<SavedCampaign> {
  const title = input.topic?.trim() || input.sourceText.trim().slice(0, 60);
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      title,
      source_text: input.sourceText,
      topic: input.topic || null,
      audience: input.audience || null,
      kit: input.kit,
      created_by: input.createdBy,
    })
    .select("id, title, source_text, topic, audience, kit, created_by, created_at")
    .single();
  if (error) throw new Error(error.message);
  return toSavedCampaign(data as CampaignRow);
}

export async function deleteCampaign(id: string): Promise<void> {
  const { data, error } = await supabase.from("campaigns").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not delete this campaign.");
}
