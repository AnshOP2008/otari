import { calendarSourceUrl } from "@/lib/document-text";

export function CalendarSourceLink({ url }: { url?: string | null }) {
  const href = calendarSourceUrl(url);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-xs underline">
      Open in Google Calendar
    </a>
  );
}
