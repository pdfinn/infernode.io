---
title: 5. Give Veltro a task
description: Your own instruction, carried out by tools you can read and revoke.
sidebar:
  order: 5
---

The tour was somebody else's script. This step is yours.

## Ask for something real

In Lucia's conversation zone, or from a terminal with `veltro '…'`, give it a
job that requires more than one tool. Something like:

```
read the files in /lib/veltro/demos and summarise what each one does
```

or

```
find every file under /appl that mentions cowfs and tell me how they relate
```

Veltro will pick tools, run them, and show its working. What it picked is not a
mystery — it came from `/tool/tools`, which you read in step 4.

## Watch what it actually did

While it works, or after it finishes, look at the trail:

```sh
; cat /tool/tools
```

Each tool directory has a `doc` file describing what it does and a `schema` file
giving its call signature:

```sh
; cat /tool/search/doc
; cat /tool/search/schema
```

An agent's capability surface is a directory listing. You do not have to trust a
description of what the agent can do — you can enumerate it.

:::note[Tools are mounted, not registered]
`/tool` is served by a program (`tools9p`) that presents each tool as a small
directory. Adding a capability means mounting something new. Removing one means
it is not in the namespace. There is no plugin registry to audit and no
"disabled" flag to get wrong.
:::

## Narrow it and try again

This is the part worth doing slowly, because it is the part that is different.

Look at what the agent has been granted:

```sh
; cat /tool/paths
```

Those are the paths it can reach. Not the paths it is *allowed* to reach — the
paths that exist for it. Ask it to do something involving a path that is not on
that list, and watch what comes back.

That failure is the subject of the next step, and it is worth arriving at it
having tried this yourself first.

## Verify

You have this step when you have given the agent an instruction you invented,
seen it complete, and can name which tools it used by reading the filesystem
rather than by trusting its summary.

<div class="expected">

Ask it directly:

```
which tools did you just use, and what does each one do?
```

Then check its answer against `/tool/tools` and the `doc` files. It should
match, and you should be able to prove it does.

</div>

:::tip[If the agent stalls]
Long tasks can exhaust the default memory pools. Relaunch with larger ones —
`-pheap=1024m -pmain=1024m -pimage=1024m` — which is what the GUI launcher
already passes.
:::

---

Next: [Namespaces contain](/docs/quick-start/namespaces-contain/) — try to make
the agent reach something it should not, and find out why it cannot.
