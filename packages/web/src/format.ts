const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  // ICU 77 (Node 24) defaults grouping to "min2", which omits the thousands
  // separator for 4-digit values (e.g. "1234,56 €"). Force grouping on so euro
  // amounts always render with the Italian thousands separator ("1.234,56 €").
  useGrouping: true,
});

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Rome",
});

export function formatEuroFromCents(cents: number): string {
  return euro.format(cents / 100);
}

export function formatDateIt(iso: string): string {
  return dateFmt.format(new Date(iso));
}
