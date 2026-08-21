---
title: 7. Your work survives
description: What is durable, what is replaceable, and how to get yesterday back.
sidebar:
  order: 7
---

Step 6 was about what an agent cannot reach. This one is about what you keep.

The contract is one sentence: **system updates replace the system tree and never
touch `/usr`. All of `/usr` is durable.**

## Why there is nothing to configure

There is no disk image. InferNode's root is an ordinary host directory — an app
bundle, an install directory, or a source checkout — and it is treated as
*replaceable system content*: `dis/`, `/lib`, `/module`, the fonts. Two things
keep everything you care about out of it:

**Your documents are never inside the app.** Desktop boots mount the host
filesystem and set your Inferno home to your host home directory. Files you
create are host files, in the usual place.

**`/usr` is bound whole from `~/.infernode/usr`.** Every user home, plus the
service state that lives under `/usr` — secstore, the audit chain, snapshot
markers and logs — resolves to the durable side.

The practical consequence is the part worth knowing:

<div class="expected">

Delete the application. Install a newer one. The same `~/.infernode` binds over
it and nothing is lost.

</div>

First boot seeds `/usr/inferno` from the shipped skeleton once; after that the
durable copy is authoritative, so a later release's skeleton changes do not
overwrite a home you have been using.

## Turning on history

Durability is not the same as history. Durability means today's work is still
there tomorrow; history means you can get *yesterday's* back. History is opt-in:

**Settings → Snapshots**, or from a shell:

```sh
; touch /usr/inferno/snapshots/on
```

With that marker present, `snapd(8)` archives the whole of `/usr` — plus the
config overlays that live outside it, `/lib/ndb`, the theme, `/lib/veltro` and
`/lib/keyring` — once a day into a local write-once **venti** store, as a single
**vac** archive.

Each snapshot is one line in `/usr/inferno/snapshots/log`: a date and a 45-byte
score.

```sh
; cat /usr/inferno/snapshots/log
```

That score is the whole archive. Content that has not changed is stored once and
shared, so a daily snapshot costs only what actually differs from the day
before.

:::note[Venti and vac]
**Venti** is a write-once, content-addressed block store: a block's address *is*
the hash of its contents, so identical data can only ever be stored once and
stored data cannot be silently altered. **vac** packs a directory tree into it
and hands you a single score standing for the whole tree. Both come from Plan 9,
and both are documented in the manual — `venti(2)`, `ventisrv(8)`, `vacget(1)`,
`vacfs(4)`.
:::

## Getting a past state back

A score is not an opaque backup blob. Mount it and walk it like any other
filesystem:

```sh
; vacfs <score>          # mount that snapshot read-only
```

or pull individual files out of it:

```sh
; vacget <score>
```

Because it mounts read-only, recovering one file from three weeks ago does not
involve restoring anything — you mount the old tree, copy what you want, and
unmount.

## While you are in Settings

Two panels landed alongside snapshots and are worth knowing about:

**Settings → Snapshots** — the toggle above, plus the snapshot log.

**Settings → Auditing** — turns on the tamper-evident audit log. It is off by
default because most installs do not need it, but if you care about the
compliance story, this is the switch. Records are hash-chained and checkpoints
are signed by factotum, so the log can be verified offline by someone holding
only a public key. See [`auditfs(4)`](https://github.com/infernode-os/infernode/blob/main/man/4/auditfs)
and the [SP 800-92 evidence document](https://github.com/infernode-os/infernode/blob/main/docs/compliance/SP800-92-audit-log.md).

## More users

`newuser(8)` creates additional accounts, each with its own home under the
durable `/usr` and its own namespace. It finishes something upstream documented
but never implemented — the manual page for it existed inside a roff
ignore-block for years.

## Verify

You have this step when you can say where your files actually are.

<div class="expected">

Two answers, and both should feel obvious by now:

- Documents you create are **host files in your host home**, not inside the app.
- Everything InferNode keeps about you lives under **`~/.infernode`**, which no
  application update touches.

</div>

---

That is the quick start. You have a running system, a model behind it, an agent
that works, a containment boundary you tested yourself, and a clear answer about
what survives.

The full persistence design — why it is shaped this way, and how it maps onto
what Plan 9 and Inferno originally did — is in
[PERSISTENCE.md](https://github.com/infernode-os/infernode/blob/main/docs/PERSISTENCE.md).
For everything else: the [man pages](https://github.com/infernode-os/infernode/tree/main/man),
the [user manual](https://github.com/infernode-os/infernode/blob/main/docs/USER-MANUAL.md),
or [CONTRIBUTING.md](https://github.com/infernode-os/infernode/blob/main/CONTRIBUTING.md)
if you want to build on it.
