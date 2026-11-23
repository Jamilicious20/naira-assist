/** Formats kobo as Naira without floating-point drift (₦1,234.50). */
export function formatNaira(kobo: number): string {
  const negative = kobo < 0;
  const abs = Math.abs(Math.round(kobo));
  const naira = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const k = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}₦${naira}.${k}`;
}

/** "Today", "Yesterday" or "12 Nov". */
export function formatTxnDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
