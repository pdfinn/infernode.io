---
title: 4. Everything is a file
description: The single idea InferNode is built on, in six commands.
sidebar:
  order: 4
---

This is the step that makes everything else predictable. It takes about five
minutes and there is only one idea in it.

Open a shell — in Lucia, ask the agent for one, or use the terminal you already
have if you are running headless. You want the `;` prompt.

## Read the system

Programs in InferNode do not call APIs to find out about the machine. They read
files.

```sh
; cat /dev/time
```

```sh
; cat /dev/user
```

```sh
; ls /prog
```

`/dev/time` is the clock. `/dev/user` is who you are. `/prog` is the process
table — one directory per running process, each containing files describing it.
There is no `getpid()`, no `time()`, no process API. There is a filesystem.

```sh
; cat /dev/sysctl
Fourth Edition (20120928)
```

## Write to the system

If reading state is reading a file, then changing state is writing one.

```sh
; echo 'What is 2+2?' > /mnt/llm/ask
; cat /mnt/llm/ask
```

You just used a language model with `echo` and `cat`. No SDK, no client library,
no API key in a config file, no JSON. The model is mounted into your filesystem
and you talk to it the way you talk to everything else.

:::note[9P]
The protocol underneath is **9P** (called Styx in Inferno) — a small file
protocol of thirteen message types, documented in section 5 of the manual.
Anything that speaks it can appear in your filesystem: a device, a remote
machine, a language model, another agent. This is why "everything is a file" is
a design rather than a slogan.
:::

## See what the agent can see

The agent's tools are files too:

```sh
; cat /tool/tools
```

That is the list of everything Veltro can do, one name per line. Each tool has
its own directory with documentation you can read:

```sh
; cat /tool/read/doc
```

Nothing is hidden behind a registry or a plugin manifest. If you want to know
what an agent is capable of, you read a file. If you want to change it, you
change what is mounted.

## Why this matters

Three consequences follow from this one idea, and they are the reason InferNode
exists:

**Everything is inspectable.** There is no state you cannot `cat`. Debugging an
agent means reading files, not attaching a debugger to a framework.

**Everything is scriptable.** Shell pipelines work on system internals, model
output, and agent tools alike, because they are all text in files.

**Everything is containable.** This is the important one. If every capability is
a file, then removing a capability is not a permission check that some code has
to remember to perform — it is a file that is simply not there. That is step 6.

## Verify

You have this step when you can answer, without looking it up: *how would I find
out what tools this agent has?*

<div class="expected">

```sh
; cat /tool/tools
```

If that was your answer, you have understood InferNode.

</div>

---

Next: [Give Veltro a task](/docs/quick-start/give-veltro-a-task/) — your own
instruction, not the tour's.
