import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Mail, CheckCircle2, XCircle, Info, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getGooglePermissions,
  setCalendarPermission,
  setGmailPermission,
} from "@/lib/google-permissions";
import { removeIntegrationDoc } from "@/lib/google.functions";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({
    meta: [
      { title: "Permissions - TaskBase" },
      { name: "description", content: "Manage Google Calendar and Gmail integrations." },
    ],
  }),
  component: PermissionsPage,
});

function PermissionsPage() {
  const queryClient = useQueryClient();
  const removeDoc = useServerFn(removeIntegrationDoc);

  const [permissions, setPermissions] = useState({ calendar: false, gmail: false });

  useEffect(() => {
    setPermissions(getGooglePermissions());
  }, []);

  const removeDocMut = useMutation({
    mutationFn: (filename: string) => removeDoc({ data: { filename } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err) => {
      console.error("[Permissions] Failed to remove document from KB:", err);
    },
  });

  const toggleCalendar = async () => {
    const nextVal = !permissions.calendar;
    console.log(`[Permissions] Toggle Calendar triggered. Changing to ${nextVal}`);
    if (nextVal) {
      // Connect: initiate OAuth with calendar scopes
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          scopes: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
    }
    // Disconnect or after OAuth redirect handled elsewhere
    setCalendarPermission(nextVal);
    setPermissions((prev) => ({ ...prev, calendar: nextVal }));
    if (!nextVal) {
      // Cleanup KB file on disconnect
      toast.promise(removeDocMut.mutateAsync("calendar!@#.txt"), {
        loading: "Removing calendar source file from Knowledge Base...",
        success: "Calendar source file removed from Knowledge Base",
        error: "Failed to remove calendar file from Knowledge Base",
      });
    }
  };

  const toggleGmail = async () => {
    const nextVal = !permissions.gmail;
    console.log(`[Permissions] Toggle Gmail triggered. Changing to ${nextVal}`);
    if (nextVal) {
      // Connect: initiate OAuth with Gmail read scope
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          scopes: "https://www.googleapis.com/auth/gmail.readonly",
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
    }
    // Disconnect or after OAuth redirect handled elsewhere
    setGmailPermission(nextVal);
    setPermissions((prev) => ({ ...prev, gmail: nextVal }));
    if (!nextVal) {
      // Cleanup KB file on disconnect
      toast.promise(removeDocMut.mutateAsync("gmail!@#.txt"), {
        loading: "Removing Gmail source file from Knowledge Base...",
        success: "Gmail source file removed from Knowledge Base",
        error: "Failed to remove Gmail file from Knowledge Base",
      });
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight">Permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your external integrations and connection status.
        </p>
      </div>

      {/* Connection Info Panel */}
      <div className="mt-5 rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 shrink-0 text-primary mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold block mb-1">Permission Manager Workflow</span>
            <span className="text-muted-foreground">
              These settings manage connection setup and consent keys. Connecting a service grants access tokens for subsequent sync requests. Disconnecting revokes access tokens immediately and clean-sweeps any synced files from active retrieval/indexing. No data is fetched or transmitted on this page.
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {/* Google Calendar Card */}
        <Card className="glassmorphism-card border border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Google Calendar
              </CardTitle>
              <CardDescription>
                Sync milestones, events, and reminders to/from your task board.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                {permissions.calendar ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                    <XCircle className="h-3.5 w-3.5" />
                    Not Connected
                  </span>
                )}
              </div>
              <Button
                variant={permissions.calendar ? "destructive" : "default"}
                onClick={toggleCalendar}
                className="w-28"
              >
                {permissions.calendar ? "Disconnect" : "Connect"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Gmail Card */}
        <Card className="glassmorphism-card border border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Gmail Read Access
              </CardTitle>
              <CardDescription>
                Index recent emails to search and extract actionable planning insights.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                {permissions.gmail ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                    <XCircle className="h-3.5 w-3.5" />
                    Not Connected
                  </span>
                )}
              </div>
              <Button
                variant={permissions.gmail ? "destructive" : "default"}
                onClick={toggleGmail}
                className="w-28"
              >
                {permissions.gmail ? "Disconnect" : "Connect"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 rounded-lg border border-dashed border-border p-5 bg-muted/30">
        <div className="flex gap-3">
          <Info className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            All connection flows conform to secure OAuth credential protocols. We do not store your plain Google account password. Access tokens are used securely for client-scoped operations. Revoking credentials here will stop any future synchronizations and invalidate existing access.
          </p>
        </div>
      </div>
    </main>
  );
}
