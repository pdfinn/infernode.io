---
title: Design the interface first
description: In this system the file interface is the design. Sketch it before you write code.
sidebar:
  order: 4
---

One procedural rule matters more than the rest:

> **Design the file interface first, and show it to someone before you build.**

A twenty-line namespace sketch can be reviewed in minutes. Three weeks of code
cannot. And because the namespace *is* the interface, most design errors are
visible in the sketch.

## The sketch

The deliverable is the tree your server presents, what each file reads and
writes, and a sample shell session:

```
/mnt/sensors/
    ctl                # write: 'poll 30', 'reset'
    status             # read: 'ok 12 stations'
    station-1/
        temperature    # read: '22.5'
        humidity       # read: '0.65'
        log            # read: one reading per line

; cat /mnt/sensors/station-1/temperature
22.5
; echo poll 30 > /mnt/sensors/ctl
```

Look at what that already decided, with no code written: the API (anything that
can open a file), the access policy (carried by file modes, not by checks), and
the data format.

For a real service the sketch goes in a proposal issue using the **New Service /
Tool Proposal** template, before implementation.

## Conventions

**Placement follows authorship.** A tree's mount point is decided by who
authored its schema, not where the bytes live. `/mnt/<app>` is for trees a local
program synthesizes — the schema is ours — even when the backing data is remote.
`/n/<source>` is the import yard: foreign trees mounted intact, named for their
source. A few older trees predate the convention; don't copy them.

**Control files, not config files.** A service is commanded by writing text to
`ctl` and reports through readable files, not by parsing a config file at
startup. Where a write changes a value that can also be read, the write format
matches the read format.

**Writes are RPCs — on both sides.** The server rejects a bad request with an
error reply, so failures land at the writer. The caller's dual matters just as
much: a 9P write can fail, and its error is the server talking to you. A caller
that logs the error and continues has not handled it. Hardening ships as new
error replies, so validation you passed last month may reject you today.

**Sessions via the clone pattern.** When clients need per-session state, serve a
`clone` file: reading it allocates a session and returns its id, and a directory
of that name appears with the session's files.

**Records are text lines.** One value per file, one record per line, fields
space-separated most-significant-first, RFC 3339 timestamps, key-value data as
hierarchy rather than encoded into a file.

## Mechanism, not policy

Prefer namespace, mount, process-group, file-permission and protocol-shape
solutions over bolted-on policy code. Three real decisions from the codebase:

**Restricting paths.** The wrong version is a check inside the tool —
`if(!pathwithin(args, granted)) return "ERROR: path not granted"`. The right
version binds a shadow directory so ungranted paths do not exist. Why: the check
ran in one place, but paths are reachable from many — the `exec` tool bypassed
it entirely, because shell arguments cannot be reliably parsed. The bind covers
every avenue at once, because every avenue goes through name resolution.
**Policy code guards a door; the namespace removes the room.**

**Protecting the audit trail.** The wrong version is an ACL system for log
access. The right version serves `log` write-only and `chain` read-only, and
binds only `log` into the agent's namespace. Access control by placement, not by
an ACL that has to be correct in every configuration.

**Effects an agent proposes.** The wrong version gates an effectful file behind
an approval flag. The right version is the proposal/commit split, covered in
[Contain and restore](/docs/concepts/contain-and-restore/).

## Compose, don't invent

**New guarantees come from composing services.** The tamper-evident audit log is
not a logging subsystem — it is a `keyring` hash chain plus a factotum-signed
checkpoint, exposed as one small file server you could delete. Its off-host
anchoring "machinery" is `cp /mnt/audit/head <elsewhere>`.

When you need a new guarantee, reach for what exists — factotum for signing,
secstore for secrets at rest, venti for write-once content, the namespace for
confinement — before writing anything resembling a framework.

**Ship mechanism; leave policy to the namespace.** The audit server appends and
seals. *Where* the log persists, for how long, and whether it ships off-host are
decided by what you mount at the path. Retention is a mount decision, not a code
feature.

**Do not build the grand unified anything.** No central logger, no plugin
registry, no service bus. Small pieces, composed by mounting.

## Smells to catch in review

None of these is an absolute prohibition — JSON is right at external boundaries,
a flat config is right for a host-side build. The smell is finding one *inside*
the namespace, doing a job the namespace does better.

| Smell | The InferNode question |
|---|---|
| JSON crossing a 9P interface | Why isn't the hierarchy the schema? |
| A policy check on a path the caller can name | Why is the path nameable at all? |
| A config file a service parses at startup | Why not a `ctl` file — or a mount? |
| A client library other programs must link | Why isn't `open`/`read`/`write` enough? |
| A daemon with a bespoke socket protocol | Why not a 9P server? |
| A central registry, manager, or bus | What existing mechanism composes instead? |
| "Access denied" reachable by a confined process | Denial should be absence. |
| A second copy of a security predicate | Share the function. |
| A global "busy" flag any client can wedge | Per-fid session state, torn down at clunk; exclusivity is `DMEXCL`. |
| UI policy inside a device driver | Drivers deliver events; policy lives in the window system. |
| An effectful file an agent can reach, guarded by a flag | Proposal/commit split; put the commit outside the agent's namespace. |

## What the system already gives you

Check this before building infrastructure. All of it is wired into boot, and new
features are expected to compose with it.

- **Audit** (`/mnt/audit`, `auditfs(4)`) — one write to emit a record. Absence
  of the mount is a silent no-op, never a dependency.
- **Agent provenance** (`auditprov(2)`) — trajectories sealed into the chain,
  bulky payloads write-once in venti.
- **Durability** (`snapd(8)`) — state a user would be upset to lose goes under
  `/usr`, where durability is free. There is no persistence API to call; it is
  a `bind`.
- **Secrets and signing** — keys live in factotum and secstore; ML-DSA
  signatures are made *by* factotum, so services never hold private keys.
- **Payments** (`wallet9p`) — budgets, approval queues and EIP-712 validation
  are the wallet's job. A feature that spends writes a proposal; it never
  handles key material.
- **Capability lint** (`nsaudit(1)`) — run it when you change what an agent can
  be granted. Advisory; the namespace still enforces.

---

Ready to write one? [Build a 9P service](/docs/build/) walks a complete example
end to end.
