import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export const QUSD_ABI = [
  {
    inputs: [{ name: "to", type: "address" }],
    name: "dripTo",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "dripAvailableIn",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "DRIP_AMOUNT",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const qusdAddress = () => process.env.QUSD_ADDRESS as Address | undefined;

export const publicClient = () =>
  createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.RPC_URL ?? "https://sepolia.base.org"),
  });

/**
 * The faucet signs with the deployer key rather than asking the visitor to
 * connect a wallet — the whole point is to top up a Privy treasury that holds
 * no gas and cannot call drip() for itself.
 */
export const faucetClient = () => {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) return null;
  return createWalletClient({
    account: privateKeyToAccount(pk as `0x${string}`),
    chain: baseSepolia,
    transport: http(process.env.RPC_URL ?? "https://sepolia.base.org"),
  });
};
