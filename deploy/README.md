# Deploying Quorly

Two containers behind Caddy: the Go API and the Next.js web app. Caddy
terminates TLS and gets certificates from Let's Encrypt automatically.

```
                 :443
   internet ──→ caddy ─┬─→ web:3000   (quorly.xyz)
                       └─→ api:8080   (api.quorly.xyz)

   web ──→ api:8080 over the compose network
```

The browser only ever talks to `quorly.xyz`. The web app reaches the API over
the internal network, which keeps the Privy session cookie same-origin.

## DNS

| Type | Name  | Value          |
|------|-------|----------------|
| A    | `@`   | 13.206.61.146  |
| A    | `api` | 13.206.61.146  |
| A    | `www` | 13.206.61.146  |

Let Caddy issue certificates *after* DNS resolves — an HTTP-01 challenge
against a name that doesn't point here yet will fail and back off.

## First run

```bash
ssh -i quorly.pem ubuntu@13.206.61.146
git clone git@github.com:Nishu0/quorly.git ~/quorly   # needs the deploy key
cd ~/quorly
./deploy/provision.sh        # docker, swap, firewall, deploy key
# add the printed key at github.com/Nishu0/quorly/settings/keys
scp .env                     # from your laptop; never committed
./deploy/deploy.sh
```

## Updating

```bash
ssh -i quorly.pem ubuntu@13.206.61.146 'cd ~/quorly && ./deploy/deploy.sh'
```

Builds happen before anything stops, so a failed build leaves the running
stack untouched.

## Notes

- **Swap is not optional.** 3.8GB of RAM cannot build Next.js; without swap the
  OOM reaper kills it part-way and the deploy looks hung.
- **`caddy_data` holds the certificates.** Deleting that volume means
  re-issuing, and Let's Encrypt rate-limits repeated issuance for a name.
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one needs a
  rebuild, not a restart.
