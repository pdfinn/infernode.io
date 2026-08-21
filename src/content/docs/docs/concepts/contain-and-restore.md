---
title: Contain and restore
description: Assume the model fails. Bound what the failure reaches, record what it did, put it back.
sidebar:
  order: 3
---

Most approaches to agent safety try to stop an agent doing the wrong thing.
InferNode assumes it will, and answers a different question: **how much damage
is reachable, how would you know, and can you undo it?**

The premise is stated plainly in the security model: a model interpreting
hostile input may follow an attacker's instructions, and **prompt text is not an
authorization boundary**. Everything below is built on that assumption rather
than against it.

## The four layers

| Layer | Mechanism | What it gives you |
|---|---|---|
| **Contain** | Namespace — `restrictns()`, `FORKNS`, `NODEVS` | A structural bound on reachable damage, decided before the model runs |
| **Constrain effects** | Proposal/commit split | Sends, mutations, payments and delegation need a capability issued outside the model's namespace |
| **Detect** | Hash-chained audit log with agent provenance | A record of what happened that the audited subject cannot alter |
| **Restore** | Copy-on-write staging, venti snapshots | Review writes before they land; remount any past state read-only |

## Contain

The namespace bounds authority. A subverted agent can still only touch what was
mounted, and that bound is structural rather than evaluated — there are no rules
to be incomplete and no enforcement path to get wrong.

This is the difference from a policy engine, which bounds damage only insofar as
its rules cover every case and its checks run everywhere they should. See
[Namespaces](/docs/concepts/namespaces/) for why the guarantee holds.

The standing invariants for hostile input, from the security model:

- **Quarantine ingestion.** Process raw external content in a separate agent
  namespace with no credentials, raw network, send or payment endpoints,
  arbitrary execution, or capability-provisioning control.
- **Never combine sensitive reads with egress.** A worker may receive exact
  read-only snapshots, *or* a constrained egress capability — not both.
  Otherwise prompt injection becomes exfiltration.
- **Grant paths, not ambient services.** Exact files and exact 9P subtrees, over
  directories, `/net`, `/mnt/factotum`, or whole service roots.

## Constrain effects

Containment decides what is reachable. The proposal/commit split decides what is
*committable*.

The wrong shape is letting an agent write to an effectful file behind an
approval flag — because a flag is something a model can learn to set. The right
shape is that agent-visible files create inert proposals (`/mnt/msg/draft`),
while the trusted controller's files (`pending`, `approve`, `deny`) are simply
never bound into an agent namespace at all.

**The model cannot mint approval, because approval lives in a namespace the
model does not inhabit.** The same pattern covers message sends, file edits, and
payments alike.

The wallet takes this further. There is no raw `sign` file to hide, because
signing an attacker-chosen 32-byte hash can authorize an arbitrary transfer —
dangerous to *any* holder. When an interface cannot be attenuated into safety,
it is removed and a safe one exposed instead: structured `pay` proposals and
`authorize` requests the wallet validates and budget-checks.

## Detect

The audit log is a Styx server at `/mnt/audit` with a five-file surface. Records
form a linear SHA-256 hash chain, so editing, reordering, or deleting anything
changes its hash and every hash after it. The server assigns sequence numbers
and timestamps, so a writer cannot backdate or reorder its own entries.

Access control is placement, not an ACL: `log` is write-only, `chain`, `head`,
`verify` and `pubkey` are read-only, and an agent's namespace gets *only* `log`
bound in. **A process that can append to its own trail but cannot name `chain`
cannot rewrite history** — tamper-evidence by construction.

Checkpoints are signed by **factotum** using ML-DSA-87, so `auditfs` never holds
the private key, and `auditverify -k pubkey` checks every signature offline with
no secret at all.

### Agent provenance

Veltro seals every agent trajectory — prompts, tool calls, completions, and
capability grants — into that chain. Bulky payloads do not bloat it: they are
stored write-once in a venti content store and referenced from the record.

```
content=<score> sha256=<hex> size=<n>
```

The detail that matters: **the score is only a locator; the SHA-256 is the
integrity pin**, and it is sealed under the audit chain's own SHA-256. Venti
addresses content by SHA-1, so pinning with SHA-256 means venti's addressing
cannot be used to equivocate a payload after the fact. Fetch payloads with
`auditget(1)`; the interface is `auditprov(2)`.

Capability grants are first-class records here — which is to say **the namespace
is the record**. What the agent was allowed to reach is part of the evidence,
not a separate configuration you have to correlate afterwards.

:::note[Off by default]
Auditing is opt-in: **Settings → Auditing**, or the marker at
`/usr/inferno/audit/on`. Most installs do not need it; a compliant deployment
must enable it. Emitters are silent no-ops when `/mnt/audit` is not mounted, so
the facility tears out by simply not mounting it.
:::

## Restore

Detection tells you what happened. Two mechanisms put it back.

**Copy-on-write staging.** Where an agent has write access, those writes can go
to an overlay rather than to real files: reads fall through to the base, writes
redirect, deletes become whiteouts. You then review a changeset — `diff` shows
`M`/`A`/`D` per path — and promote or revert it, whole or file by file. That is
`git add -p` semantics for agent side effects, not an undo button.

**Snapshots.** With snapshots enabled, `snapd(8)` archives all of `/usr` plus
the config overlays daily into a local write-once venti store as one vac
archive. Each is a single line — a date and a 45-byte score — and any past state
mounts read-only with `vacfs(4)` or extracts with `vacget(1)`. Identical content
dedupes, so a snapshot costs only what changed.

See [Your work survives](/docs/quick-start/your-work-survives/) for the
operational side.

## The honest limits

A strategy is trustworthy only if it states its own ceiling.

**The bound is only as good as the grant.** A namespace holding both
confidential reads and unrestricted egress lets a subverted model exfiltrate. No
prompt compensates for that.

**Effects that left the machine do not come back.** A request that was sent, a
host command that ran, or a payment that settled cannot be undone by unmounting
anything. Restore covers the filesystem, not the world.

**Reversibility is sometimes semantic.** "The agent overwrote `notes.txt`" is
reversible with a snapshot and not otherwise. Whether that counts as recovery is
context-dependent, and no tool decides it for you.

**`nsaudit` passing does not mean safe.** It means free of the authority
compositions `nsaudit` knows to check for. Prompt-injection propagation
specifically is not statically decidable: once an agent acts on hostile data,
effective authority is whatever the model decides — bounded by the grant, and by
nothing else. That ceiling is the one this project advertises.

---

Next: [Design the interface first](/docs/concepts/design-first/) — how to build
something that composes with all of this.
