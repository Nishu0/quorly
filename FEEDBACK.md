# Selfie Check integration feedback

Required deliverable for the World "Selfie Check" track. Everything below is a
first-hand observation from building Quorly, dated 2026-09-09.

---

## 1. Selfie Check docs and integration flow

**Worked well**

- `world-id/credentials/11` states the assurance level bluntly — "does not provide a
  strict one-person-one-account guarantee" — which is exactly the sentence an
  integrator needs before designing around it. Many identity products bury this. It
  directly shaped our design: Selfie Check gates *presence*, the Privy key quorum
  gates *authority*.
- The 90-day validity window is stated up front, so we could design a freshness
  policy instead of discovering staleness in production.
- The `SKILL` page (`docs.world.org/world-id/SKILL`) is genuinely the best artifact in
  the doc set — it names the three rules that actually matter (server-side RP signing
  only, verify at `/api/v4/verify/{rp_id}`, `UNIQUE (action, nullifier)`). It should be
  linked from the top of every credential page, not just discoverable via search.

**Confusing or missing**

- **Version split is unexplained.** `selfieCheckLegacy()` is the documented helper, and
  the preset table says Selfie Check uses "World ID 3.0" while `proofOfHuman` uses 4.0.
  Nothing says whether a 4.0 Selfie Check is coming, whether `allow_legacy_proofs`
  matters here, or whether `selfieCheckLegacy` will be renamed. We couldn't tell if we
  were building against a deprecated surface on day one.
- **No end-to-end verify example for Selfie Check.** The request side has a code
  sample; the response side does not. We had to infer the `/api/v4/verify/{rp_id}`
  request body's field names and the shape of a success response. A single annotated
  request/response pair — including what `verification_level` comes back as for a
  Selfie Check proof — would have saved an hour.
- **No error-code table.** `user_presence_failed` is mentioned in passing under
  `require_user_presence`. There is no enumeration of what a Selfie Check verification
  can fail with, which is precisely what an integrator needs to write user-facing copy.
  We ended up with a generic "Selfie Check failed (`code`)" string because we couldn't
  enumerate the cases.
- **Access gating is stated but not actionable.** "Requires special access" appears on
  the preset, with no link to the request form, no expected turnaround, and no way to
  tell from the Developer Portal whether your app has been granted it. For a hackathon
  this is the single biggest blocker: you cannot start the real flow, and you can't tell
  how long you'll be waiting.
- **No guidance on what Selfie Check is *not* for.** The docs say it isn't a uniqueness
  guarantee, but stop there. A short "good fits / bad fits" section would prevent the
  obvious misuse of treating it as KYC.

---

## 2. Developer Portal: navigation, search, product discovery, debugging

- **Product discovery is inverted.** Selfie Check is found by browsing to a numbered
  credential URL (`/credentials/11`). Numbered paths are unguessable and unmemorable;
  they also imply an ordering that carries no meaning. Slugs (`/credentials/selfie-check`)
  would make the docs linkable in a team chat without an explanation.
- **Search surfaces the marketing site over the docs.** Searching "selfie check request
  access" returns `world.org` announcements and third-party press ahead of
  `docs.world.org`. The one page we wanted — how to request access — we never found by
  search; we found it by guessing URL segments, and one guess
  (`/world-id/sandbox/access`) 404s while the real page is
  `/world-id/sandbox/sandbox-access`. A redirect from the obvious slug would help.
- **No debugging surface documented.** There is a Portal, and there are proofs that can
  fail, but nothing in the docs explains where to see a failed verification attempt,
  its reason, or its request ID. When our verify call returns a non-200, we have the
  status code and nothing else. A per-app "recent verifications" log with failure
  reasons would be the single highest-value addition to the Portal.
- **`app_id` vs `rp_id` vs `action` is under-explained.** Three identifiers, introduced
  across three pages, with the RP signing key added as a fourth secret. One diagram
  showing which lives in the browser, which lives on the server, and which is a secret
  would remove an entire class of misconfiguration.

---

## 3. Sandbox: app states, proof flows, test users, errors, edge cases

- **The hot/cold/semi-cold framing is excellent** and unusually thorough — enumerating
  the full cold funnel (install → account creation → DOB → invite code → enrollment →
  Selfie Check) is exactly the coverage matrix a QA plan needs. More docs should be
  written this way.
- **Access is a hard gate with an unstated SLA.** Sandbox requires TestFlight (iOS) or a
  private Play track (Android), each requiring an emailed account and an approval step,
  with the only stated remedy being an email address if you're *rejected*. There is no
  "typical turnaround" number. For a time-boxed hackathon, this converts "integrate
  Selfie Check" into "integrate Selfie Check if approval lands in time" — we built a
  simulation fallback specifically so the project would still demo.
- **Platform asymmetry is flagged but not detailed.** iOS semi-cold flows "have
  restrictions around invite code redemption compared to Android." That's the *shape*
  of a limitation without the limitation itself. Which flows are untestable on iOS?
- **No documented way to force a failure.** We wanted to test our stale-proof and
  replay paths against the real sandbox, which requires deliberately producing a failed
  or expired proof. Nothing describes how to do that. Test accounts that can be put
  into a known-bad state (expired credential, failed liveness) would let integrators
  test their unhappy paths, which is where the security actually lives.
- **No stated behaviour for the 90-day expiry in sandbox.** Can it be simulated? Waiting
  90 days is not a test plan.

---

## 4. Summary of the highest-impact fixes

1. Publish an error-code table for Selfie Check verification failures.
2. Add a per-app verification log with failure reasons to the Developer Portal.
3. Make the access-request path a linked, self-serve form with a stated turnaround.
4. Give credentials slug URLs and redirect the obvious guesses.
5. Document how to force failure states in sandbox (expired, replayed, failed liveness).
6. Add one annotated verify request/response pair per credential type.
