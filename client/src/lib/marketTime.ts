// US equities market hours: 9:30 AM – 4:00 PM ET, Mon–Fri.
// Returns a status object based on the current Eastern time.

export type MarketStatus = {
  state: "open" | "pre" | "after" | "closed";
  label: string;
  helper: string;
};

function getEasternParts(now: Date) {
  // Format the date in America/New_York and parse parts back. This is
  // DST-aware without pulling in a full TZ library.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  return { weekday, hour, minute };
}

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const { weekday, hour, minute } = getEasternParts(now);
  const totalMin = hour * 60 + minute;
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  const preStart = 4 * 60;
  const afterEnd = 20 * 60;

  if (isWeekend) {
    return { state: "closed", label: "Markets closed", helper: "Reopens Monday 9:30 ET" };
  }
  if (totalMin >= open && totalMin < close) {
    return { state: "open", label: "Markets open", helper: "Closes 4:00 PM ET" };
  }
  if (totalMin >= preStart && totalMin < open) {
    return { state: "pre", label: "Pre-market", helper: "Opens 9:30 AM ET" };
  }
  if (totalMin >= close && totalMin < afterEnd) {
    return { state: "after", label: "After hours", helper: "Closes 8:00 PM ET" };
  }
  return { state: "closed", label: "Markets closed", helper: "Reopens 4:00 AM ET" };
}

export function formatEasternClock(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}
