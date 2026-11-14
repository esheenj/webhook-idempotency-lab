# Webhook Retry & Idempotency Lab

**One request. One intended effect.**

An original, dependency-free, MIT-licensed browser and CLI sandbox for investigating idempotency decisions when webhook notifications or HTTP requests are retried. The model is a **deterministic educational simulation**: it never accepts real webhooks, calls an endpoint, performs a payment or triggers a side effect.

**Live demo:** https://esheenj.github.io/webhook-idempotency-lab/

## Product purpose

**Webhook Retry & Idempotency Lab** is the public display name for this small offline simulation of webhook and HTTP retry decisions. It is part of Sigma Code's **Integration Reliability Tools** collection.

**For:** API engineers, CRM implementers, technical agencies and QA teams. **Input:** invented ordered events plus an illustrative idempotency policy. **Output:** inspectable simulated decisions showing how key reuse, payload conflicts, in-flight requests and expiry can affect duplicate-handling.

**Commercial pathway:** the free MIT example can help frame a scoped webhook-review or test-implementation enquiry via [Sigma Code](mailto:info@sigmacode.co.za?subject=Webhook%20retry%20and%20idempotency%20review). No paid service or customer outcome is asserted.

**Boundary:** there is no real webhook receiver, persistent state, signature verification, concurrent transactional processing or production guarantee. The repository slug, CLI and package name are unchanged.

## Run locally

Requires Node.js 20+.

```bash
git clone https://github.com/esheenj/webhook-idempotency-lab.git
cd webhook-idempotency-lab
npm test
npm run demo
npm run build
```

For a fictional custom scenario:

```bash
node src/cli.mjs examples/scenario.json
```

The browser runs entirely offline. Paste JSON, click **Evaluate scenario**, inspect per-event results and download a JSON report. All state resets on reload. No API key, backend or subscription is needed.

## Simulated behavior

The input contains `policy: {ttlMs,requireKey}` and an ordered `events` array. Each event has a globally unique `eventId` and an ISO 8601 timestamp with an explicit timezone. A `deliver` event has `tenant`, `route`, optional `key` and an object `payload`. A `complete` event references `originEventId` and has a simulated successful `responseCode` (200, 201, 202 or 204).

| Case | Example simulated HTTP status | Meaning |
| --- | --- | --- |
| First scoped key | 202 | Hypothetical operation pending |
| Same key and payload, still pending | 409 | In-flight conflict, not a second operation |
| Same key and payload, after completion | Saved 2xx | Previously completed response replayed |
| Same key, different payload | 422 | Payload mismatch; reject reuse |
| Key missing when required | 400 | Refuse untracked operation |
| Duplicate event identifier | 409 | Reject repeated journal entry |
| Old record beyond configured TTL | 202 | **Can admit another effect**; expiration needs deliberate policy |

A key is scoped to `tenant + route + key`; payload comparison uses deterministic key-sorted JSON representation rather than a collision-prone demo hash. No payload is included in exported decisions. Records are stored only in temporary memory and never shared across browser tabs.

This model is informed by the **October 2026 Internet-Draft**, [The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/), *not* a published RFC. It does not implement that structured header's wire syntax or claim standard certification. HTTP requests and provider webhook event IDs are not universally interchangeable. Vendor contracts and retry guarantees must be checked independently.

## Explicit boundaries

A production idempotency handler needs atomic durable commits, normalized fingerprints, key retention, replay response storage, concurrency and crash recovery controls. Real incoming webhook endpoints also need signature verification, trust-boundary enforcement and provider-specific event-ID rules. **None of those are implemented here.**

The simulator uses fictional data, does not process payments or trading instructions, and does not connect to Esheen Labs private Cortex, SIGMA or Commander services. A positive verdict only means the chosen toy policy admitted a sample input; it is not proof of security, exactly-once delivery, provider compatibility, business correctness or availability.

Browser input max 1 MiB; maximum 300 events. No runtime dependencies or recurring infrastructure charge.

## Contributions and voluntary support

Open a small issue with a fictional reproduction, expected and actual decisions, and a negative test. Never attach customer data, credentials, private payloads or trading secrets.

Optional [public Esheen Labs support page](https://esheenj.github.io/compound-intelligence-starter/support.html). Verify the current crypto deposit address/network/minimum before donating. Native GitHub Sponsors and fiat merchant checkout are not represented as active.

© 2026 Esheen Labs. MIT License.
