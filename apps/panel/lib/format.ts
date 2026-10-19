const nf = new Intl.NumberFormat("en-US");

export const num = (n: number) => nf.format(n);

export const pct = (part: number, whole: number) =>
  whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`;

export const day = (epoch: number) =>
  new Date(epoch * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export const month = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

/** "Oct ’24", for axis ticks. */
export const monthShort = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${name} \u2019${String(y).slice(2)}`;
};
