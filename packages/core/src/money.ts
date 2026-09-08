import { parseUnits, formatUnits } from "viem";

export const USDC_DECIMALS = 6;

export function toBaseUnits(amount: string | number): string {
  return parseUnits(String(amount), USDC_DECIMALS).toString();
}

export function fromBaseUnits(base: string | bigint): string {
  return formatUnits(BigInt(base), USDC_DECIMALS);
}

export function usd(amount: string | number): string {
  return Number(amount).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function caip2(chainId: number): string {
  return `eip155:${chainId}`;
}
