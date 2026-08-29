import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, FileText, Loader2, Megaphone, Upload, Download, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generateCampaign } from "@/lib/ai.functions";
import type { CampaignKit } from "@/lib/ai.types";
import { ORG_TYPES } from "@/lib/joji";
import { WorkspaceHeader } from "./workspace-header";

export function CampaignPage() {
  const generate = useServerFn(generateCampaign);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [kit, setKit] = useState<CampaignKit | null>(null);
  const [busy, setBusy] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadSaved, setLeadSaved] = useState(false);
  const [fileName, setFileName] = useState("");

  function requestGeneration() {
    if (text.trim().length < 20) { toast.error("Add at least 20 characters of campaign text first."); return; }
    try { if (!localStorage.getItem("joji.campaign.lead")) { setLeadOpen(true); return; } } catch { /* continue */ }
    void runGeneration();
  }

  async function runGeneration() {
    setBusy(true);
    try { setKit(await generate({ data: { text, topic: topic || undefined, audience: audience || undefined } })); toast.success("Campaign kit ready for review"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Campaign generation failed."); }
    finally { setBusy(false); }
  }

  function saveLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try { localStorage.setItem("joji.campaign.lead", JSON.stringify(Object.fromEntries(form))); } catch { /* best effort */ }
    setLeadSaved(true);
    window.setTimeout(() => { setLeadOpen(false); setLeadSaved(false); void runGeneration(); }, 350);
  }

  async function parseFile(file: File) {
    setFileName(file.name);
    try {
      if (file.name.toLowerCase().endsWith(".txt")) setText(await file.text());
      else if (file.name.toLowerCase().endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        setText(result.value);
      } else toast.error("Upload a .docx or .txt file.");
    } catch { toast.error("Could not read that document."); }
  }

  async function downloadPdf() {
    if (!kit) return;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF();
    let y = 18;
    pdf.setFontSize(20); pdf.text("JOJI Campaign Kit", 16, y); y += 12;
    pdf.setFontSize(9); pdf.text("AI-generated draft · Review with a native speaker before publishing.", 16, y); y += 10;
    const sections = [...kit.leaflets.map((item) => `${item.language} leaflet\n${item.body}`), `Radio script\n${kit.radioScript}`, `WhatsApp\n${kit.whatsapp}`, `SMS\n${kit.sms}`, `Facebook\n${kit.facebook}`, `Community health worker script\n${kit.chwScript}`];
    pdf.setFontSize(11);
    for (const section of sections) {
      const lines = pdf.splitTextToSize(section, 178);
      if (y + lines.length * 5 > 280) { pdf.addPage(); y = 18; }
      pdf.text(lines, 16, y); y += lines.length * 5 + 7;
    }
    pdf.save("joji-campaign-kit.pdf");
  }

  return <div className="min-h-screen"><WorkspaceHeader eyebrow="Campaign Studio / Draft to distribution" title="One source. Every community." description="Create a complete campaign kit from one source document, then review each channel and language before it reaches the public." action={kit ? <Button variant="outline" onClick={() => void downloadPdf()}><Download className="size-4" /> Download PDF</Button> : undefined} />
    <div className="space-y-8 px-5 py-6 sm:px-8 lg:px-10">
      <section className="surface p-5 sm:p-7"><div className="grid gap-5 lg:grid-cols-[1fr_0.7fr]"><div><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-secondary text-teal"><Megaphone className="size-5" /></span><div><p className="label-mono text-muted-foreground">Source material</p><h2 className="text-lg font-semibold">What should this campaign say?</h2></div></div><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a health announcement, education note, or programme brief here…" className="mt-5 min-h-52" /><div className="mt-3 flex flex-wrap items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-secondary"><Upload className="size-3.5" /> {fileName || "Upload .docx or .txt"}<input className="sr-only" type="file" accept=".docx,.txt" onChange={(e) => { const file = e.target.files?.[0]; if (file) void parseFile(file); }} /></label>{fileName && <span className="text-xs text-muted-foreground">Imported successfully</span>}</div></div><div className="space-y-4"><div className="space-y-2"><Label>Topic (optional)</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Childhood immunisation" /></div><div className="space-y-2"><Label>Audience (optional)</Label><Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. Parents in rural communities" /></div><div className="rounded-xl bg-secondary/70 p-4 text-sm text-muted-foreground"><FileText className="mb-2 size-4 text-teal" /><p>JOJI will prepare four language leaflets plus radio, WhatsApp, SMS, Facebook and community worker versions.</p></div><Button className="w-full" onClick={requestGeneration} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />} Generate campaign kit</Button></div></div></section>
      {busy && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3].map((n) => <div key={n} className="surface h-40 animate-pulse bg-secondary/50" />)}</div>}
      {kit && !busy && <CampaignResults kit={kit} />}
      <p className="label-mono rounded-xl border border-border bg-secondary/45 px-4 py-3 text-muted-foreground">AI-generated draft. Review with a native speaker before publishing.</p>
    </div>
    <Dialog open={leadOpen} onOpenChange={setLeadOpen}><DialogContent><DialogHeader><DialogTitle>Tell us where JOJI is helping</DialogTitle><DialogDescription>Save your details once to unlock campaign generation.</DialogDescription></DialogHeader><form onSubmit={saveLead} className="space-y-4"><div className="space-y-2"><Label>Name</Label><Input name="name" required placeholder="Dr. Amina Bello" /></div><div className="space-y-2"><Label>Email</Label><Input name="email" required type="email" placeholder="you@hospital.org" /></div><div className="space-y-2"><Label>Phone</Label><Input name="phone" required placeholder="+234 800 000 0000" /></div><div className="space-y-2"><Label>Organisation type</Label><Select name="orgType" defaultValue="Hospital"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ORG_TYPES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div><Button className="w-full" type="submit">{leadSaved ? <Check className="size-4" /> : null} Continue to generation</Button></form></DialogContent></Dialog>
  </div>;
}

function CampaignResults({ kit }: { kit: CampaignKit }) {
  const cards = [...kit.leaflets.map((item) => ({ title: `${item.language} leaflet`, body: item.body })), { title: "Radio script", body: kit.radioScript }, { title: "WhatsApp message", body: kit.whatsapp }, { title: "SMS message", body: kit.sms }, { title: "Facebook post", body: kit.facebook }, { title: "Community health worker script", body: kit.chwScript }];
  return <section><div className="mb-4 flex items-end justify-between"><div><p className="label-mono text-teal">Your kit</p><h2 className="mt-1 text-2xl font-semibold">Ready for human review</h2></div><span className="label-mono text-muted-foreground">{cards.length} deliverables</span></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map((card) => <OutputCard key={card.title} {...card} />)}</div></section>;
}

function OutputCard({ title, body }: { title: string; body: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard?.writeText(body); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }
  return <article className="surface flex min-h-52 flex-col p-5"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{title}</h3><Button variant="outline" size="icon" onClick={() => void copy()} aria-label={`Copy ${title}`}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</Button></div><p className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{body}</p></article>;
}