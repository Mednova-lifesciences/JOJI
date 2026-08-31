import { useState, type ReactNode } from "react";
import { Baby, CalendarDays, CircleHelp, Droplets, HeartPulse, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  cycleForecast,
  formatDate,
  postpartumFromBirth,
  pregnancyFromLmp,
  vaccinationSchedule,
  BREASTFEEDING_QUESTIONS,
} from "@/lib/joji";
import { setTranslatePrefill } from "@/lib/translate-prefill";
import { WorkspaceHeader, MedicalDisclaimer } from "./workspace-header";

export function MaternalPage() {
  const [lmp, setLmp] = useState("");
  const [birth, setBirth] = useState("");
  const [dob, setDob] = useState("");
  const [lastPeriod, setLastPeriod] = useState("");
  const [cycle, setCycle] = useState("28");
  const [period, setPeriod] = useState("5");
  const pregnancy = lmp ? pregnancyFromLmp(new Date(`${lmp}T12:00:00`)) : null;
  const postpartum = birth ? postpartumFromBirth(new Date(`${birth}T12:00:00`)) : null;
  const vaccines = dob ? vaccinationSchedule(new Date(`${dob}T12:00:00`)) : null;
  const forecast = lastPeriod
    ? cycleForecast(new Date(`${lastPeriod}T12:00:00`), Number(cycle) || 28, Number(period) || 5)
    : null;
  return (
    <div className="min-h-screen">
      <WorkspaceHeader
        eyebrow="Maternal Health / Field tools"
        title="Practical tools for every stage."
        description="Simple estimates for pregnancy, postpartum care, immunisation and cycle planning. Bring the result into a conversation with your health worker."
      />
      <div className="px-5 py-6 sm:px-8 lg:px-10">
        <Tabs defaultValue="pregnancy">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-5">
            <TabsTrigger value="pregnancy" className="gap-2 py-2.5">
              <HeartPulse className="size-4" /> <span className="hidden sm:inline">Pregnancy</span>
            </TabsTrigger>
            <TabsTrigger value="postpartum" className="gap-2 py-2.5">
              <Baby className="size-4" /> <span className="hidden sm:inline">Postpartum</span>
            </TabsTrigger>
            <TabsTrigger value="vaccines" className="gap-2 py-2.5">
              <Droplets className="size-4" /> <span className="hidden sm:inline">Vaccines</span>
            </TabsTrigger>
            <TabsTrigger value="breastfeeding" className="gap-2 py-2.5">
              <CircleHelp className="size-4" />{" "}
              <span className="hidden sm:inline">Breastfeeding</span>
            </TabsTrigger>
            <TabsTrigger value="cycle" className="gap-2 py-2.5">
              <RotateCcw className="size-4" /> <span className="hidden sm:inline">Cycle</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pregnancy">
            <ToolCard
              icon={HeartPulse}
              title="Pregnancy due date calculator"
              description="Estimate the expected date of delivery using the first day of your last menstrual period."
            >
              <DateField label="First day of last period" value={lmp} onChange={setLmp} />
              {pregnancy && (
                <ResultGrid
                  items={[
                    ["Expected due date", formatDate(pregnancy.edd)],
                    [
                      "Current gestation",
                      `${pregnancy.weeks} weeks${pregnancy.daysRemainder ? `, ${pregnancy.daysRemainder} days` : ""}`,
                    ],
                    ["Trimester", `${pregnancy.trimester} trimester`],
                  ]}
                />
              )}
            </ToolCard>
          </TabsContent>
          <TabsContent value="postpartum">
            <ToolCard
              icon={Baby}
              title="Postpartum stage calculator"
              description="Understand the broad stage of recovery after birth. Every recovery is personal."
            >
              <DateField label="Baby's birth date" value={birth} onChange={setBirth} />
              {postpartum && (
                <ResultGrid
                  items={[
                    ["Time since birth", `${postpartum.weeks} weeks (${postpartum.days} days)`],
                    ["Current stage", postpartum.stage],
                  ]}
                />
              )}
            </ToolCard>
          </TabsContent>
          <TabsContent value="vaccines">
            <ToolCard
              icon={Droplets}
              title="Routine immunisation schedule"
              description="A simplified Nigeria NPHCDA schedule with estimated visit dates. Bring this alongside your child's health card."
            >
              <DateField label="Child's date of birth" value={dob} onChange={setDob} />
              {vaccines && (
                <div className="mt-6 overflow-hidden rounded-xl border border-border">
                  <div className="hidden grid-cols-[1fr_9rem_5rem] gap-4 bg-secondary/70 px-4 py-3 label-mono text-muted-foreground sm:grid">
                    <span>Vaccine visit</span>
                    <span>Estimated date</span>
                    <span>Status</span>
                  </div>
                  {vaccines.map((row) => (
                    <div
                      key={row.name}
                      className={`grid gap-2 border-t border-border px-4 py-4 sm:grid-cols-[1fr_9rem_5rem] sm:gap-4 ${row.next ? "bg-accent/60" : ""}`}
                    >
                      <div>
                        <p className="text-sm font-medium">{row.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{row.protects}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{formatDate(row.due)}</p>
                      <p
                        className={`text-xs font-semibold ${row.next ? "text-teal" : row.past ? "text-muted-foreground" : "text-foreground"}`}
                      >
                        {row.next ? "Next" : row.past ? "Completed" : "Upcoming"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ToolCard>
          </TabsContent>
          <TabsContent value="breastfeeding">
            <section className="surface p-6 sm:p-8">
              <p className="label-mono text-teal">Breastfeeding Q&A</p>
              <h2 className="mt-2 text-2xl font-semibold">Questions worth asking early.</h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Choose a question to open it in Translate, where you can make it personal and share
                the response with your care team.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {BREASTFEEDING_QUESTIONS.map((question) => (
                  <Button
                    key={question}
                    variant="outline"
                    className="h-auto justify-between whitespace-normal p-4 text-left"
                    onClick={() => {
                      setTranslatePrefill(question);
                      window.location.assign("/app/translate");
                    }}
                  >
                    {question}
                    <CalendarDays className="ml-3 size-4 shrink-0 text-teal" />
                  </Button>
                ))}
              </div>
              <div className="mt-6">
                <MedicalDisclaimer />
              </div>
            </section>
          </TabsContent>
          <TabsContent value="cycle">
            <ToolCard
              icon={RotateCcw}
              title="Cycle & ovulation calculator"
              description="Estimate fertile days from your usual cycle pattern. It is not contraception or a diagnosis."
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <DateField
                  label="Last period started"
                  value={lastPeriod}
                  onChange={setLastPeriod}
                />
                <NumberField label="Cycle length (days)" value={cycle} onChange={setCycle} />
                <NumberField label="Period length (days)" value={period} onChange={setPeriod} />
              </div>
              {forecast && (
                <ResultGrid
                  items={[
                    ["Next period", formatDate(forecast.nextPeriod)],
                    ["Estimated ovulation", formatDate(forecast.ovulation)],
                    [
                      "Fertile window",
                      `${formatDate(forecast.fertileStart)} – ${formatDate(forecast.fertileEnd)}`,
                    ],
                  ]}
                />
              )}
            </ToolCard>
          </TabsContent>
        </Tabs>
        <div className="mt-8">
          <MedicalDisclaimer />
        </div>
      </div>
    </div>
  );
}

function ToolCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof HeartPulse;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="surface mt-6 max-w-5xl p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-teal">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="label-mono text-muted-foreground">Calculator</p>
          <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="mt-7">{children}</div>
    </section>
  );
}
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="max-w-xs space-y-2">
      <Label>{label}</Label>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min="1"
        max="60"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
function ResultGrid({ items }: { items: string[][] }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-secondary/70 p-4">
          <p className="label-mono text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-lg font-semibold text-teal">{value}</p>
        </div>
      ))}
    </div>
  );
}
