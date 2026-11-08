import { toast } from "sonner";

export interface GooglePermissions {
  calendar: boolean;
  gmail: boolean;
}

const STORAGE_KEYS = {
  CALENDAR: "taskbase_google_calendar_connected",
  GMAIL: "taskbase_google_gmail_connected",
  PROMPT_SEEN: "hasSeenGooglePermissionPrompt",
};

export function getGooglePermissions(): GooglePermissions {
  if (typeof localStorage === "undefined") {
    return { calendar: false, gmail: false };
  }
  return {
    calendar: localStorage.getItem(STORAGE_KEYS.CALENDAR) === "true",
    gmail: localStorage.getItem(STORAGE_KEYS.GMAIL) === "true",
  };
}

export function setCalendarPermission(connected: boolean) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.CALENDAR, String(connected));
  console.log(`[Google Permissions] Calendar connected state changed to: ${connected}`);
  if (connected) {
    toast.success("Google Calendar connected successfully");
  } else {
    toast.info("Google Calendar disconnected");
  }
}

export function setGmailPermission(connected: boolean) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.GMAIL, String(connected));
  console.log(`[Google Permissions] Gmail connected state changed to: ${connected}`);
  if (connected) {
    toast.success("Gmail read access connected successfully");
  } else {
    toast.info("Gmail read access disconnected");
  }
}

export function hasSeenPermissionPrompt(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEYS.PROMPT_SEEN) === "true";
}

export function markPermissionPromptSeen() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.PROMPT_SEEN, "true");
  console.log("[Google Permissions] Marked permission prompt as seen");
  toast.success("Connection setup preference saved");
}

export async function verifyGoogleTokenScopes(accessToken: string): Promise<boolean> {
  if (!accessToken) return false;
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) {
      console.warn("[Google Scopes] Tokeninfo check failed with status:", res.status);
      return false;
    }
    const data = await res.json();
    const scopeStr: string = data.scope || "";
    console.log("[Google Scopes] Granted scopes:", scopeStr);

    const hasCalRead = scopeStr.includes("calendar.readonly") || scopeStr.includes("https://www.googleapis.com/auth/calendar");
    const hasCalEvents = scopeStr.includes("calendar.events") || scopeStr.includes("https://www.googleapis.com/auth/calendar");
    const hasGmail = scopeStr.includes("gmail.readonly") || scopeStr.includes("https://mail.google.com/");

    if (!hasCalRead || !hasCalEvents || !hasGmail) {
      console.warn("[Google Scopes] One or more required Google scopes are missing!");
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Google Scopes] Error checking token scopes:", err);
    return false;
  }
}
