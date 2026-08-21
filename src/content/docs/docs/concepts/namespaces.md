---
title: Namespaces
description: Per-process, built rather than given — and the security model falls out of it.
sidebar:
  order: 2
---

This is the deep idea. Everything InferNode claims about security is a
consequence of it, not a system layered on top of it.

## Per-process, built, not given

A namespace is a process's private view of the filesystem. It is not a global
tree with permissions applied on top — each process gets its own, assembled by
mounting exactly what it should have.

Two processes on the same machine can disagree completely about what `/`
contains, and neither is wrong.

## Authority is the namespace

There is no separate permission system to consult. What a process can do is
exactly what it can name. Grant a capability by mounting it; revoke one by not
mounting it. There is no third state, no "granted but disabled," no flag that
code has to remember to check.

The construction is `nsconstruct->restrictns()`, which uses `FORKNS` to give the
process a private namespace and `NODEVS` to stop it attaching new devices to get
around the first part.

## Denial is absence

An agent confined to `/appl/veltro` that tries to read `/appl/cmd/date.b` does
not get *permission denied*. It gets **file does not exist** — because in its
world, the file does not exist.

This is called the **truthful environment**, and the payoff is not tidiness.
There is no probing oracle: a confined process cannot map the shape of what it
is being denied, because denial and nonexistence are the same observation. It
cannot walk a tree learning which paths exist-but-are-forbidden, because that
category does not exist.

:::tip[The rule that follows]
If you find yourself writing a check that produces an "access denied" error for
a path a confined process can name, stop. The right fix is almost always to make
the path unnameable instead.
:::

## Attenuation composes downward

Namespace restriction is an allowlist: a shadow directory is built containing
only the permitted entries and bound over the original (`restrictdir()` in
`appl/veltro/nsconstruct.b`).

Because a child forks an already-restricted namespace and can only narrow it
further, **grants shrink monotonically down the process tree**. A subagent can
be handed exactly one MCP server, or exactly one tool, and cannot reach anything
its parent did not have.

You never need a policy engine to reason about what a delegation chain can do.
You read its namespace.

The agent-facing consequence is worth stating: each turn, the running agent's
actual namespace is injected into its context, and `cat /tool/tools` shows the
restricted view rather than the full catalogue. **The enforcement mechanism and
the agent's self-knowledge are the same object.** There is no concept of an
unavailable tool — an ungranted tool simply is not there.

## Distribution is namespace composition

Location transparency is not a feature anyone built here; it falls out of the
model.

`speech9p` only ever touches its local namespace, so audio moves between
machines by composing namespaces before the server starts — export `/dev` on one
host, mount it and bind over `/dev/audio` on the other — with zero changes to
`speech9p` itself.

Likewise `/mnt/llm` is the canonical name whether a local `llmsrv` self-mounts
there or a remote one arrives over the network:

```sh
; mount -k <keyfile> tcp!peer!5640 /mnt/llm
```

Locality is not placement. It is just how the name got populated. A consumer
that probes for where a service "really" is has misunderstood the system.

## This is verified, not asserted

The isolation property — that a mount performed in one process group never
appears in another's mount table except by its own action — has been
model-checked exhaustively at small scale and to **3.17 billion distinct states**
at medium scale, with supporting SPIN models for the concurrent code and CBMC
proofs over the C implementation.

The specifications are in
[`formal-verification/`](https://github.com/infernode-os/infernode/tree/main/formal-verification).

:::caution[What that does and does not mean]
The results are exhaustive *within stated bounds*, with an abstraction gap
documented in `formal-verification/README.md`. Three real races were found and
mitigated in the host threading layer along the way. Claims in this project cite
evidence — a `path:line`, a test, a model — and known gaps are written down with
tracker keys rather than rounded up to "secure."
:::

---

Next: [Contain and restore](/docs/concepts/contain-and-restore/) — what this
buys you when an agent goes wrong.
