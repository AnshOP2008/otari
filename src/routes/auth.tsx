import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in - TaskBase" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(
    import.meta.env.VITE_SUPABASE_URL || "",
  );

  async function google() {
    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/auth/callback" },
      });
      if (error) throw error;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start Google sign-in.");
      setPending(false);
    }
  }

  async function emailAuth(create = false) {
    setPending(true);
    try {
      const { data, error } = create
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) await navigate({ to: "/home" });
      else toast.info("Check your email to confirm your account.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-12">
      <div className="card-soft w-full space-y-4 p-6 sm:p-8">
        <Link to="/" className="text-sm underline">
          Back to Planning Desk
        </Link>
        <h1 className="text-3xl font-semibold">Sign in to TaskBase</h1>
        <p className="text-sm text-muted-foreground">
          Upload sources, chat with your workspace, and save tasks to your board.
        </p>
        {!local && (
          <Button onClick={google} disabled={pending} variant="outline" className="w-full">
            Continue with Google
          </Button>
        )}
        {local && (
          <p className="text-sm text-muted-foreground">
            Local workspace. Use an email account for this device.
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void emailAuth();
          }}
          className="space-y-3"
        >
          <label className="block text-sm">
            Email
            <Input
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            Password
            <Input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <Button type="submit" disabled={pending} className="w-full">
            Sign in with email
          </Button>
          {local && (
            <Button
              type="button"
              variant="outline"
              disabled={pending || !email || password.length < 8}
              className="w-full"
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (form?.reportValidity()) void emailAuth(true);
              }}
            >
              Create local account
            </Button>
          )}
        </form>
      </div>
    </main>
  );
}
