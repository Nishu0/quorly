import { formatUnits } from "viem";
import { apiOrNull } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { PageHeader, Field, Amount } from "@/components/quorly/primitives";
import { QUSD_ABI, publicClient, qusdAddress } from "@/lib/qusd";
import { FaucetForm } from "./faucet-form";

export const dynamic = "force-dynamic";

interface Org {
  name: string;
  treasuryAddress: string | null;
  settlementToken: string;
}

export default async function FaucetPage() {
  const org = await apiOrNull<Org>("/api/org");
  const token = qusdAddress();

  let treasuryBalance: string | null = null;
  if (token && org?.treasuryAddress) {
    try {
      const raw = await publicClient().readContract({
        address: token,
        abi: QUSD_ABI,
        functionName: "balanceOf",
        args: [org.treasuryAddress as `0x${string}`],
      });
      treasuryBalance = formatUnits(raw, 6);
    } catch {
      treasuryBalance = null;
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Test currency"
        title={
          <>
            Quorly USD,
            <br />
            on <em className="italic">tap</em>.
          </>
        }
        lede="Circle's Base Sepolia faucet caps out at 20 USDC, which isn't enough to demo a $20,000 approval. QUSD mirrors USDC's interface and 6-decimal precision, so nothing in the app treats it differently — it just isn't scarce."
      />

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="reveal">
          <h2 className="label mb-5">Pull from the faucet</h2>
          <FaucetForm treasury={org?.treasuryAddress ?? undefined} deployed={Boolean(token)} />
          <p className="mt-4 text-xs leading-relaxed text-ink-faint">
            10,000 QUSD per address, once an hour. The faucet signs with the deployer key rather
            than asking you to connect a wallet — the treasury is a Privy wallet holding no gas, so
            it can&apos;t pull for itself.
          </p>
        </section>

        <aside className="reveal" style={{ animationDelay: "90ms" }}>
          <div className="rounded-lg border border-rule bg-card px-6 py-2">
            <dl>
              <Field label="Token" mono>
                {token ? shortAddress(token) : "not deployed"}
              </Field>
              <Field label="Symbol">QUSD</Field>
              <Field label="Decimals" mono>
                6
              </Field>
              <Field label="Network">Base Sepolia</Field>
              <Field label="Treasury" mono>
                {shortAddress(org?.treasuryAddress)}
              </Field>
            </dl>
          </div>

          {treasuryBalance !== null && (
            <div className="mt-6 border-l border-rule pl-5">
              <p className="label mb-2.5">Treasury holds</p>
              <Amount value={treasuryBalance} currency="QUSD" size="lg" />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
