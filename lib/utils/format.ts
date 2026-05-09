const KRW = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const PCT = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

export const fmtKRW = (n: number) => KRW.format(n);
export const fmtUSD = (n: number) => USD.format(n);
export const fmtPct = (n: number) => PCT.format(n);
export const fmtNum = (n: number) => NUM.format(n);

/** "1500만원" 같은 한국식 단위 표기 */
export function fmtKRWShort(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_0000_0000) return `${sign}${(abs / 1_0000_0000).toFixed(2)}억원`;
  if (abs >= 1_0000) return `${sign}${(abs / 1_0000).toFixed(0)}만원`;
  return `${sign}${abs.toLocaleString("ko-KR")}원`;
}
