import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Loader2, MessageSquareQuote, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { ORG_TYPES } from "@/lib/joji";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — JOJI by MedNova Lifesciences" },
      {
        name: "description",
        content: "Log in or create a JOJI workspace for your hospital, NGO or health programme.",
      },
      { property: "og:title", content: "Sign in — JOJI" },
      {
        property: "og:description",
        content: "Access JOJI's multilingual health communication tools.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, ready, signIn, signUp } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) navigate({ to: "/app/translate", replace: true });
  }, [ready, user, navigate]);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await signIn(String(form.get("email")), String(form.get("password")));
      toast.success("Welcome back to JOJI");
      navigate({ to: "/app/translate" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const { needsEmailConfirmation } = await signUp({
        fullName: String(form.get("fullName")),
        email: String(form.get("email")),
        password: String(form.get("password")),
        orgType: String(form.get("orgType") || "Hospital"),
        organization: String(form.get("organization") || ""),
        phone: String(form.get("phone")),
      });
      if (needsEmailConfirmation) {
        toast.success("Check your email to confirm your account, then log in.");
      } else {
        toast.success("Workspace created");
        navigate({ to: "/app/translate" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <aside className="deep-panel hidden flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-cream/15">
            <MessageSquareQuote className="size-4.5 text-cream" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold text-cream">JOJI</p>
            <p className="label-mono text-cream/60">MedNova Lifesciences</p>
          </div>
        </div>
        <div>
          <h1 className="max-w-md text-4xl leading-tight font-semibold text-cream">
            Every patient deserves to be understood.
          </h1>
          <p className="mt-4 max-w-md text-cream/70">
            Real-time consultation translation, multilingual campaign kits and maternal health tools
            — designed for Nigerian clinics and community programmes.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-cream/60">
          <ShieldCheck className="size-4" /> Secured by Supabase Auth.
        </p>
      </aside>

      <main className="flex items-center justify-center bg-background px-5 py-12">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="label-mono inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to home
          </Link>

          <div className="surface mt-5 p-7">
            <h2 className="text-2xl font-semibold">Access your workspace</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in, or create a workspace for your organisation.
            </p>

            <Tabs defaultValue="login" className="mt-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      required
                      placeholder="you@hospital.org"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      name="password"
                      type="password"
                      required
                      minLength={6}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />} Log in
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input id="fullName" name="fullName" required placeholder="Dr. Amina Bello" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      required
                      placeholder="you@hospital.org"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="orgType">Organisation type</Label>
                      <Select name="orgType" defaultValue="Hospital">
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
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone number</Label>
                      <Input id="phone" name="phone" required placeholder="+234 800 000 0000" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="organization">Organisation name</Label>
                    <Input
                      id="organization"
                      name="organization"
                      placeholder="Lagos University Teaching Hospital"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />} Create workspace
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}
