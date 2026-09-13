import { NextResponse } from "next/server";
import { formatEther, isAddress, parseEther } from "viem";
import { api, ApiError } from "@/lib/api";
import { faucetClient, publicClient } from "@/lib/qusd";

/** Enough for a good number of ERC-20 transfers on Base Sepolia. */
const TOP_UP = parseEther("0.002");

/** Above this a wallet can already pay its own way, so sponsoring is refused. */
const ENOUGH = parseEther("0.0005");

export const dynamic = "force-dynamic";

/**
 * Sponsors gas for the signed-in member's own wallet.
 *
 * Privy wallets hold tokens the moment an invoice is paid, but no native ETH,
 * and a wallet with tokens and no gas can receive without ever being able to
 * spend. This tops it up from the deployer so being paid is enough to be able
 * to withdraw.
 *
 * The destination is read from the API rather than the request body: an
 * address the caller supplies would turn this into a faucet that drains the
 * deployer to anywhere.
 */
export async function POST() {
  let address: string;
  try {
    const wallet = await api<{ address: string }>("/api/wallet");
    address = wallet.address;
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: "Sign in first." }, { status });
  }

  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { error: "Your wallet is still being created. Reload in a moment." },
      { status: 409 },
    );
  }

  const sponsor = faucetClient();
  if (!sponsor) {
    return NextResponse.json(
      { error: "Gas sponsorship isn't configured on this deployment." },
      { status: 503 },
    );
  }

  const client = publicClient();
  const held = await client.getBalance({ address });
  if (held >= ENOUGH) {
    return NextResponse.json(
      { error: `You already have ${formatEther(held)} ETH — enough to cover gas.` },
      { status: 429 },
    );
  }

  // Refuse rather than half-fund: a sponsor that cannot cover the top-up
  // should say so, not leave a wallet stuck between useless and usable.
  const funds = await client.getBalance({ address: sponsor.account.address });
  if (funds < TOP_UP) {
    return NextResponse.json(
      { error: "The gas sponsor is empty. Ask an owner to refill it." },
      { status: 503 },
    );
  }

  try {
    const hash = await sponsor.sendTransaction({ to: address, value: TOP_UP });
    return NextResponse.json({ ok: true, hash, amount: formatEther(TOP_UP) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message.split("\n")[0] : "Transfer failed" },
      { status: 500 },
    );
  }
}
