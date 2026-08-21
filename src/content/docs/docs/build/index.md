---
title: Build a 9P service
description: Write a real InferNode service end to end — design, code, test, man page.
sidebar:
  order: 1
---

Adding a capability to InferNode means serving files. This section walks a
complete service from namespace sketch to shipped man page, using one that
already exists in the tree so you can read the finished thing alongside each
step.

The service is `countfs`: a counter with three files and three control verbs.
Deliberately tiny — small enough to hold in your head, complete enough to
exercise every convention a real service uses.

| Artifact | Path |
|---|---|
| The service | `appl/cmd/countfs.b` (~200 lines) |
| Its bytecode | `dis/countfs.dis` (built by `mk install`) |
| Contract test | `tests/inferno/countfs.sh` |
| Man page | `man/4/countfs` |

Everything it produces compiles and passes in CI.

## Before you start

You need a source checkout rather than a release — you are building bytecode, so
you need the toolchain. See
[QUICKSTART.md](https://github.com/infernode-os/infernode/blob/main/QUICKSTART.md)
for the per-platform build.

You should also have read
**[Design the interface first](/docs/concepts/design-first/)**. This section is
the practice; that page is the theory, and the tutorial assumes it.

## The two pages here

- **[Writing a 9P service](/docs/build/9p-service/)** — the seven steps, from
  sketch to man page
- **[Limbo for Go programmers](/docs/build/limbo-for-go-programmers/)** — the
  mapping, and the four gotchas that actually bite

:::tip[If you write Go, you are most of the way there]
Limbo has `spawn` where Go has `go`, channels with `alt` instead of `select`,
garbage collection, and type-inferring `:=`. Concurrency will feel like home.
The load-bearing differences are modules loaded at runtime and a handful of
sharp edges — both covered on the Limbo page.
:::
