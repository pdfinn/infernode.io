---
title: Quick start
description: Five steps from download to a contained agent doing work. About twenty minutes.
---

Work through the five steps in order. The first three get you a running system
and the one idea everything else rests on. The last two are where InferNode
stops resembling anything else you have run.

Everything happens on your own machine. There is no account, no cloud service,
and nothing to sign up for.

## The steps

| | Step | You end with |
|---|---|---|
| 1 | [Install and launch](/docs/quick-start/install/) | InferNode running, welcome document on screen |
| 2 | [Run the tour](/docs/quick-start/run-the-tour/) | An agent demonstrating the system, using the system |
| 3 | [Everything is a file](/docs/quick-start/everything-is-a-file/) | The idea that makes the rest obvious |
| 4 | [Give Veltro a task](/docs/quick-start/give-veltro-a-task/) | Your own instruction, carried out |
| 5 | [Namespaces contain](/docs/quick-start/namespaces-contain/) | An agent failing to escape, and you knowing why |

Steps 1–3 are the short path. If you only have ten minutes, stop after step 3 —
you will have seen what InferNode is. Steps 4 and 5 are where you find out
whether you want it.

## What you need

- A macOS (Apple Silicon), Linux (x86_64 or ARM64), or Windows (x86_64) machine
- About 30 MB of RAM and 10 MB of disk for InferNode itself
- No toolchain, no compiler, no dependencies — releases ship as signed binaries

:::note[Running headless?]
Every step works without the GUI — on a server, in a container, over SSH. Each
page marks the terminal path where it differs. Start at
[Install and launch](/docs/quick-start/install/) either way.
:::

## A note on what you are installing

InferNode is an operating system, not a library. It runs as a normal process on
your host — a hosted Inferno — with its own filesystem namespace, its own
process table, and its own shell. Nothing it does inside that namespace touches
your host unless you granted it a path, and step 5 is where you prove that to
yourself.
