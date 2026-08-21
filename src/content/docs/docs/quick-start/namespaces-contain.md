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

This is why the guarantee holds under conditions where policy engines do not:

- **A bug in the agent** cannot widen it, because widening requires a mount.
- **A prompt injection** cannot talk its way past it — there is no gatekeeper to
  persuade, and no path to name.
- **A compromised tool** inherits the same namespace and sees the same nothing.

Subagents are the case to be careful with. `spawn` takes an explicit `tools=`
and `paths=` set, so a subagent gets what you name in the invocation — it is not
automatically narrower than its parent. `nsaudit` has a rule for exactly this
(`SPAWN_INHERITANCE`), which fires when `spawn` is granted alongside durable
host writes, because the subagent then inherits a namespace from which durable
mutation is reachable. Narrow the spawn, or stage the writes.

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

:::caution[What containment does not cover]
Namespaces contain filesystem reach. They do not reverse effects that leave the
machine. A network request that was sent, a host command that ran, or a payment
that settled cannot be un-done by unmounting anything — those are handled by not
granting the capability in the first place, which is what `nsaudit` is for.
Be as skeptical of anyone claiming otherwise as you should be of us.
:::

---

Next: [Your work survives](/docs/quick-start/your-work-survives/) — what is
durable, what an update replaces, and how to get yesterday back.
