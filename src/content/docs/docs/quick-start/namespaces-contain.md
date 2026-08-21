---
title: 6. Namespaces contain
description: Try to make an agent reach something it should not. Watch it fail for the right reason.
sidebar:
  order: 6
---

Every system that runs AI agents claims to contain them. Almost all of them mean
the same thing by it: the agent asks to do something, a policy engine decides
whether to allow it, and the answer is usually no.

That is a *decision*. Decisions have bugs, gaps, and paths nobody enumerated.
This step is about a different kind of answer.

## Look at the boundary

From a shell inside the agent's environment:

```sh
; cat /tool/paths
```

That is the complete list of paths the agent can reach. Grants are set per
invocation — the `paths=` argument on a task or spawn — so your list depends on
how the agent was started rather than on a fixed default.

Now pick anything that is *not* under one of those paths and try to reach it.
The keyring is a good candidate, since it holds credentials and ordinary tasks
have no reason to be granted it:

```sh
; ls /lib/keyring
ls: stat /lib/keyring: file does not exist
```

If `/lib` happens to be on your granted list, pick something else that is not —
the point is the wording of the failure, not this particular path.

Read that error again. It does not say *permission denied*. It says **file does
not exist**.

That is called the **truthful environment**, and it buys more than tidiness. A
confined process cannot map the shape of what it is being denied, because denial
and nonexistence are the same observation. There is no probing oracle: an agent
cannot walk a directory learning which paths exist-but-are-forbidden, because
that category does not exist.

## Why that is the whole argument

Nothing consulted a policy. No rule matched. No check ran and returned false.

The agent's namespace was constructed with only its granted paths mounted into
it. Everything else is not forbidden — it is *absent*. There is no name for it
in that process's view of the world, so there is no request to deny and nothing
for a policy engine to get wrong.

:::note[Namespace]
A **namespace** is a process's private view of the filesystem. It is not a
global tree with permissions layered on top: each process gets its own, built by
mounting exactly what it should have. Two processes on the same machine can
disagree completely about what `/` contains, and neither is wrong.
:::

## The point is blast radius

Containment is not about stopping an agent from misbehaving. Assume it does —
through a bug, a bad instruction, a hostile web page, or a model that simply
goes wrong. The question that matters is *how much damage is reachable*, and a
namespace answers it in advance, structurally, before anything runs.

That is a different kind of answer from a policy engine, which bounds damage
only insofar as its rules are complete and its enforcement code is correct on
every path. A namespace has no rules to be incomplete. What was not mounted is
not reachable, and that holds under conditions where rule evaluation does not:

- **A bug in the agent** cannot widen it, because widening requires a mount.
- **A prompt injection** cannot widen it. Nothing stops a model being persuaded
  — InferNode's security model *assumes* it will be, and states plainly that
  prompt text is not an authorization boundary. What the namespace guarantees is
  the size of that failure: a subverted agent can still only touch what was
  mounted. The blast radius is decided before the model ever runs.
- **A compromised tool** inherits the same namespace and sees the same nothing.

- **A subagent** can never reach more than its parent. A child forks an
  already-restricted namespace and can only narrow it further, so grants shrink
  monotonically down the process tree. You do not need a policy engine to reason
  about what a delegation chain can do — you read its namespace.

The subagent case still needs care, but the risk is inheriting *too much*, not
gaining anything new. `spawn` takes an explicit `tools=` and `paths=` set, and a
child that is handed its parent's full grant is no narrower than the parent was.
`nsaudit` flags this as `SPAWN_INHERITANCE` when `spawn` is granted alongside
durable host writes. Narrow the spawn, or stage the writes.

The construction is in `nsconstruct->restrictns()`, using `FORKNS` to give the
agent a private namespace and `NODEVS` to keep it from attaching new devices to
get around the first part.

## Check it before you run it

You do not have to discover the boundary by testing it. `nsaudit` answers the
question in advance, from an agent's capability configuration:

```sh
; nsaudit DIR              # full report: what can this configuration reach?
; nsaudit DIR PATH         # is PATH reachable under these capabilities?
; nsaudit -d DIRA DIRB     # what changed between two configurations?
```

It enforces nothing — the namespace does that. It is a pre-flight review that
tells you what a configuration *will* permit, and flags the cases that matter.
One of its rules exists specifically to catch grants to durable host paths where
the agent's writes would persist with no way to undo them.

## Verify

You have this step when you have tried to reach something outside `/tool/paths`
and understood why the error said what it said.

<div class="expected">

The test that matters is not that access failed. It is *how* it failed:

- `permission denied` would mean something decided, and something that decides
  can be wrong.
- `file does not exist` means there was nothing to decide.

</div>

## Going further

**The proofs.** Namespace isolation is formally verified — in TLA+ across 3.17
billion states, plus SPIN and CBMC models. The specifications are in
[`formal-verification/`](https://github.com/infernode-os/infernode/tree/main/formal-verification).

**The security model.** The full threat model, including what containment does
*not* cover, is in
[Veltro's SECURITY.md](https://github.com/infernode-os/infernode/blob/main/appl/veltro/SECURITY.md).

**Staged writes.** Where an agent is granted write access, those writes can be
staged through a copy-on-write overlay so they are reviewed before they touch
real files — `diff` what changed, then promote or revert it file by file. See
[`appl/veltro/cowfs.b`](https://github.com/infernode-os/infernode/blob/main/appl/veltro/cowfs.b).

## Contain, then restore

Containment bounds what can go wrong. It does not, by itself, tell you what
*did* go wrong or put it back. Three further layers do:

| Layer | Mechanism | What it gives you |
|---|---|---|
| **Contain** | Namespace — `restrictns()`, `FORKNS`, `NODEVS` | A structural bound on reachable damage, verified in TLA+, SPIN and CBMC |
| **Constrain effects** | Drafting separated from effects | Sending, mutation, payment and delegation need a fresh capability issued outside the model's namespace. The model cannot mint one. |
| **Detect** | Hash-chained audit log (`auditfs`) | A record the audited subject cannot alter, signed by factotum and verifiable offline with a public key |
| **Restore** | Copy-on-write staging, venti snapshots | Agent writes reviewed before they touch real files; any past state remounted read-only |

That is the strategy in one line: **assume the model fails, bound what the
failure can reach, record what it did, and be able to put it back.** Step 7 is
the restore half.

:::caution[The honest limits]
**The bound is only as good as the grant.** A namespace holding both
confidential reads and unrestricted egress lets a subverted model exfiltrate,
and no prompt compensates for that. The standing invariant is never to combine
the two — a worker gets exact read-only snapshots, or a constrained egress
capability, not both.

**Effects that left the machine do not come back.** A request that was sent, a
host command that ran, or a payment that settled cannot be undone by unmounting
anything. Restore covers the filesystem, not the world.

**`nsaudit` passing does not mean "safe."** It means free of the authority
compositions `nsaudit` knows to check for. Prompt-injection propagation in
particular is not statically decidable — once an agent acts on hostile data,
effective authority is whatever the model decides, bounded by the grant. That
ceiling is the one we advertise.
:::

---

Next: [Your work survives](/docs/quick-start/your-work-survives/) — what is
durable, what an update replaces, and how to get yesterday back.
