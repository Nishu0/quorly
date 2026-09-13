"use client";

import { useState } from "react";
import { IconCheck, IconCopy, IconEye, IconEyeOff } from "@tabler/icons-react";

/**
 * Exports the member's private key without the server ever seeing it.
 *
 * The recipient keypair is generated here, in the browser, and only the public
 * half is sent. Privy encrypts the key to it with HPKE, our server forwards
 * the ciphertext it cannot read, and the decryption happens on this page. The
 * plaintext exists in one tab's memory and nowhere else — not in a log, not in
 * the database, not in transit in a form anyone could read.
 */
export function ExportKey() {
  const [state, setState] = useState<"idle" | "confirming" | "working" | "shown" | "error">("idle");
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run() {
    setState("working");
    setMessage("");
    try {
      // Loaded here rather than at module scope so the crypto only ships to
      // people who actually ask to export.
      const { CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } = await import("@hpke/core");
      const { Chacha20Poly1305 } = await import("@hpke/chacha20poly1305");

      const suite = new CipherSuite({
        kem: new DhkemP256HkdfSha256(),
        kdf: new HkdfSha256(),
        aead: new Chacha20Poly1305(),
      });

      const pair = await suite.kem.generateKeyPair();
      // RFC 9180 serialises a DHKEM(P-256) public key as the uncompressed
      // point, which is what Privy expects, base64-encoded.
      const raw = new Uint8Array(await suite.kem.serializePublicKey(pair.publicKey));
      const recipientPublicKey = btoa(String.fromCharCode(...raw));

      const res = await fetch("/api/wallet/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientPublicKey }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(json.error ?? "Export failed.");
        return;
      }

      const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const recipient = await suite.createRecipientContext({
        recipientKey: pair.privateKey,
        enc: bytes(json.encapsulatedKey),
      });
      const plain = await recipient.open(bytes(json.ciphertext));

      setKey(new TextDecoder().decode(plain));
      setState("shown");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Export failed.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be refused; the key is on screen to copy by hand.
    }
  }

  function hide() {
    setKey("");
    setVisible(false);
    setState("idle");
  }

  if (state === "shown") {
    return (
      <div className="rounded-lg border border-oxblood/30 bg-oxblood-soft p-5">
        <p className="text-sm font-medium text-oxblood">Your private key</p>
        <p className="mt-1 text-xs leading-relaxed text-oxblood/80">
          Anyone with this controls the wallet and everything in it. Store it somewhere only you
          can reach, and never paste it into a site or a chat.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-md bg-background/60 p-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">
            {visible ? key : "•".repeat(48)}
          </code>
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide key" : "Reveal key"}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {visible ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
          </button>
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? "Key copied" : "Copy key"}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {copied ? (
              <IconCheck className="size-4 text-forest" />
            ) : (
              <IconCopy className="size-4" />
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={hide}
          className="mt-4 text-xs text-oxblood underline-offset-2 hover:underline"
        >
          Done — clear it from this page
        </button>
      </div>
    );
  }

  if (state === "confirming") {
    return (
      <div className="rounded-lg border border-rule bg-card p-5">
        <p className="text-sm font-medium">Export the private key?</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">
          It will be decrypted in this browser tab — Quorly never sees it. Once it leaves here it
          cannot be revoked, so anyone who gets a copy owns the wallet permanently.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={run}
            className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Show me the key
          </button>
          <button
            type="button"
            onClick={() => setState("idle")}
            className="text-sm text-ink-faint hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setState("confirming")}
        disabled={state === "working"}
        className="rounded-md border border-input px-4 py-2 text-sm transition-colors hover:border-foreground disabled:opacity-50"
      >
        {state === "working" ? "Exporting…" : "Export private key"}
      </button>
      <p className="mt-2 text-xs text-ink-faint">
        Take the wallet with you. The key is decrypted in your browser, never on our servers.
      </p>
      {state === "error" && (
        <p className="mt-3 rounded-md bg-oxblood-soft p-3 text-sm text-oxblood">{message}</p>
      )}
    </div>
  );
}
