---
title: "Checking the claim the whole project rests on"
description: "InferNode bets that per-process namespaces can contain an agent. This week we stopped asserting that and model-checked it: 3.17 billion distinct states, three real races, one tautology removed."
pubDate: 2026-03-09
author: "P. D. Finn"
tags: ["formal-verification", "namespaces", "security"]
---

InferNode rests on one claim. In Inferno®, a process can reach only what is bound into its namespace, so if you give an agent a smaller namespace you give it less authority. We came to Inferno because we expected software agents to become capable enough that containing them would matter. We wanted a system where containment is the basic structure, not a filter added on top.

A claim that carries that much weight should be checked, not just repeated. It matters more now that [Lucia](/blog/lucia/) puts an agent inside that model for people who will never read the namespace code. This week the formal-verification suite was rebuilt so that it actually tests the claim. The rebuild started from an embarrassing discovery.

## The invariant that was always true

The verification framework came over with the fork in January: TLA+, SPIN and CBMC models of the namespace code in `emu/port`. When we [reviewed it](https://github.com/infernode-os/infernode/commit/8df6b212b69d6eef03987c7877e6d5e1a39d3f60) against what a publication-grade argument would need, we found that its central property, `NamespaceIsolation`, was defined as an implication whose conclusion was `TRUE`. It could not fail. The checker had been verifying a tautology.

That is not a bug a model checker can find for you, and it is the kind of thing that looks fine in a diff. This is the same lesson as our crypto work, at the scale of the whole project. The property you check has to be one that a wrong system would violate.

The new specification adds history variables. For every namespace copy, the model records a snapshot and every mount made after the copy. The isolation property then says something with content. If a channel was mounted in the parent after the copy, it appears in the child only if the child mounted it itself. The model gained `namec()` path resolution, `kchdir()`, the three fork variants (`FORKNS`, `NEWNS`, shared), and the `nodevs` restriction. Alongside isolation sit `UnilateralMountNonPropagation`, `CopyFidelity`, reference counts that never go negative, and no use after free: 11 invariants in all.

## Running it

TLC's [small configuration](https://github.com/infernode-os/infernode/commit/763f5238bbe808f3361240643e41cb0e31f299ae) explored 369,414,154 states (19.3 million distinct) in 8 minutes on 16 workers, with no violations. The [medium configuration](https://github.com/infernode-os/infernode/commit/8e1448720535e8662e3024e11113ff70785a05c8) ran for 10 hours 50 minutes on a Jetson AGX Orin, with a 50 GB heap and 341 GB of disk-backed state. It explored 26.5 billion states, 3.17 billion of them distinct, to depth 13, with no violations of any of the 11 properties.

Model checking is bounded, and the [README](https://github.com/infernode-os/infernode/blob/master/formal-verification/README.md) says so. TLC and CBMC search finite state spaces. The SPIN models abstract the real locks. The trusted base includes the compiler, the host OS's threads and the CBMC stubs. What we can say is this: within those bounds, no reachable state of the model lets a mount made after a copy leak into the other namespace. CBMC then checks the actual `pgrpcpy()` C code, not a model of it. It checks that a copy yields independent mount tables with correct reference counts, and that the malloc-failure path leaves the source namespace untouched. A SPIN model of `exportfs` checks that `..` cannot walk above an exported root, within that model.

## Three real races

The SPIN models were rewritten to remove the large `atomic{}` blocks that had hidden real interleavings, and to model `cmount()`'s actual lock sequence and the bucket-by-bucket copy in `pgrpcpy()`. The [race model](https://github.com/infernode-os/infernode/commit/46fee3d19097fb5520591e4797076b9f3c246162) then produced counterexamples for three use-after-free races in the emulator's host threading layer:

1. `kchdir()` closes the old `dot` channel and then assigns the new one, without holding a lock.
2. `Sys_pctl(FORKNS)` swaps the process-group pointer without a lock.
3. `namec()` reads `slash` and `dot` unprotected.

Dis's scheduler runs one Dis thread at a time, which masks all three. They are real for the emulator's other host threads. They are written up in `TODO-RACE-CONDITIONS.md` with suggested fixes and are not yet fixed. We would rather publish an open race with a counterexample than a clean report that hides it.

## How we are working

On 7 and 8 March, seventeen review pull requests went through: production-readiness passes over the kernel, crypto, browser, GUI and agent code, much of it done with AI reviewers. One fix [set `SECURE=1` in `devprog.c`](https://github.com/infernode-os/infernode/commit/ac64df83262116712afd436aea1471f904ffb9be), where the heap-debug device had been exposed. Generation is cheap now, so we spend the savings on checking: test vectors, stress runs, review passes, and model checkers aimed at the property everything depends on.

The [methodology](https://github.com/infernode-os/infernode/blob/master/formal-verification/METHODOLOGY.md) was written with publication in mind. Closing the three races is next, and so is taking the bounds as far as the hardware allows.
