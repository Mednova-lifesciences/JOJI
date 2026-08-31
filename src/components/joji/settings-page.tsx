import { useState, type FormEvent } from "react";
import { Check, Languages, Save, Settings2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { ORG_TYPES, PATIENT_LANGUAGES } from "@/lib/joji";
import { WorkspaceHeader } from "./workspace-header";

export function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    updateUser({
      fullName: String(form.get("fullName")),
      phone: String(form.get("phone")),
      organization: String(form.get("organization")),
      orgType: String(form.get("orgType")),
      preferredLanguage: String(form.get("preferredLanguage")),
    });
    setSaved(true);
    toast.success("Settings saved");
    window.setTimeout(() => setSaved(false), 1600);
  }

  return (
    <div className="min-h-screen">
      <WorkspaceHeader
        eyebrow="Settings / Workspace profile"
        title="Make JOJI fit your team."
        description="Keep your organisation details and preferred patient language ready for the next consultation."
      />
      <form onSubmit={save} className="max-w-3xl space-y-6 px-5 py-6 sm:px-8 lg:px-10">
        <section className="surface p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-secondary text-teal">
              <UserRound className="size-5" />
            </span>
            <div>
              <p className="label-mono text-muted-foreground">Your profile</p>
              <h2 className="text-xl font-semibold">Personal details</h2>
            </div>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" defaultValue={user.fullName} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user.email} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" name="phone" defaultValue={user.phone} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredLanguage">Patient language</Label>
              <Select name="preferredLanguage" defaultValue={user.preferredLanguage}>
                <SelectTrigger id="preferredLanguage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PATIENT_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="surface p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-secondary text-teal">
              <Settings2 className="size-5" />
            </span>
            <div>
              <p className="label-mono text-muted-foreground">Organisation</p>
              <h2 className="text-xl font-semibold">Workspace details</h2>
            </div>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="organization">Organisation name</Label>
              <Input id="organization" name="organization" defaultValue={user.organization} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgType">Organisation type</Label>
              <Select name="orgType" defaultValue={user.orgType}>
                <SelectTrigger id="orgType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORG_TYPES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <Languages className="size-3.5 text-teal" /> Team-wide language preferences can be added
            when connected to a real provider.
          </p>
        </section>

        <div className="flex items-center justify-between border-t border-border pt-5">
          <p className="text-xs text-muted-foreground">
            Your profile is stored securely in this demo browser.
          </p>
          <Button type="submit">
            {saved ? <Check className="size-4" /> : <Save className="size-4" />}{" "}
            {saved ? "Saved" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
