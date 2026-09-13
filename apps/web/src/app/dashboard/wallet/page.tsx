import { formatEther, formatUnits } from "viem";
import { apiOrNull } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { Amount, Field } from "@/components/quorly/primitives";
import { QUSD_ABI, publicClient } from "@/lib/qusd";
import { WalletActions } from "./wallet-actions";

export const dynamic = "force-dynamic";

interface Wallet {
  address: string;
  token: string;
  symbol: string;
}

export default async function WalletPage() {
  const wallet = await apiOrNull<Wallet>("/api/wallet");
  const address = wallet?.address ?? "";

  let balance = "0";
  let gas = "0";
  if (address && wallet?.token) {
    const client = publicClient();
    // Both reads are public view calls, so failing one shouldn't blank the page.
    const [token, native] = await Promise.allSettled([
      client.readContract({
        address: wallet.token as `0x${string}`,
        abi: QUSD_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      }),
      client.getBalance({ address: address as `0x${string}` }),
    ]);
    if (token.status === "fulfilled") balance = formatUnits(token.value, 6);
    if (native.status === "fulfilled") gas = formatEther(native.value);
  }

  const fundedForGas = Number(gas) > 0;

  return (
    <div>
      <div>
        <h2 className="text-lg font-medium">Your wallet</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          A Privy wallet of your own, separate from the treasury. Invoices you submit are paid
          into it, and what lands here is yours to move — no policy, no quorum, no approval.
        </p>
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="reveal">
          <h2 className="label mb-5">Send QUSD</h2>
          <WalletActions
            address={address}
            balance={balance}
            canSend={Boolean(address) && fundedForGas && Number(balance) > 0}
            reason={
              !address
                ? "Your wallet is still being created. Reload in a moment."
                : !fundedForGas
                  ? "This wallet holds no ETH. Without gas it can receive but not spend — send a little Base Sepolia ETH to the address to unlock transfers."
                  : Number(balance) === 0
                    ? "Nothing to send yet. Get paid an invoice, or pull from the faucet."
                    : ""
            }
          />
        </section>

        <aside className="reveal" style={{ animationDelay: "90ms" }}>
          <div className="rounded-lg border border-rule bg-card px-6 py-2">
            <dl>
              <Field label="Address" mono>
                {address ? shortAddress(address) : "—"}
              </Field>
              <Field label="Network">Base Sepolia</Field>
              <Field label="Gas" mono>
                {Number(gas).toFixed(4)} ETH
              </Field>
            </dl>
          </div>

          <div className="mt-6 border-l border-rule pl-5">
            <p className="label mb-2.5">Balance</p>
            <Amount value={balance} currency="QUSD" size="lg" />
          </div>
        </aside>
      </div>
    </div>
  );
}
