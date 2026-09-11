import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { QUSD_ABI, faucetClient, publicClient, qusdAddress } from "@/lib/qusd";

export async function POST(req: Request) {
  const { address } = (await req.json()) as { address?: string };

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "That doesn't look like an address." }, { status: 400 });
  }

  const token = qusdAddress();
  const wallet = faucetClient();
  if (!token || !wallet) {
    return NextResponse.json({ error: "QUSD isn't deployed yet." }, { status: 503 });
  }

  // Ask the contract first so a cooldown reads as a clear message rather than
  // an opaque revert.
  const waitSec = await publicClient().readContract({
    address: token,
    abi: QUSD_ABI,
    functionName: "dripAvailableIn",
    args: [address],
  });

  if (waitSec > 0n) {
    const mins = Math.ceil(Number(waitSec) / 60);
    return NextResponse.json(
      { error: `That address pulled recently. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` },
      { status: 429 },
    );
  }

  try {
    const hash = await wallet.writeContract({
      address: token,
      abi: QUSD_ABI,
      functionName: "dripTo",
      args: [address],
    });
    return NextResponse.json({ ok: true, hash });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message.split("\n")[0] : "Transaction failed" },
      { status: 500 },
    );
  }
}
