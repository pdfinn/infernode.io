---
title: "Four AMD64 JIT bugs that only a full boot could find"
description: "The AMD64 JIT passed its tests and still crashed booting the GUI. Fixing it took a VMA leak, an allocator that ran out of slots, a sign bit used as a flag, and an event race that only showed up at JIT speed."
pubDate: 2026-04-13
author: "P. D. Finn"
tags: ["jit", "amd64", "release", "testing"]
---

The first days after a release are when you learn which of your assumptions were only true on your own machines. Our development setup is built around Apple Silicon (the native toolchain lives in `MacOSX/arm64/bin`), so most of our hours had been spent under the ARM64 JIT. v0.1 shipped a Linux AMD64 tarball as well, and the AMD64 JIT had been passing its correctness suite since February. It looked finished, because the tests passed. This chapter is about the gap between passing tests and a working system.

Inferno®'s Dis VM has a JIT on AMD64 as well as ARM64. Run `emu -c1` and modules are compiled to native code as they load. Our unit tests passed under `-c1` on Linux AMD64, but booting the full GUI with `-c1` did not work. Sometimes it ended in `exNomem`, sometimes in `SIGSEGV`, and sometimes the boot finished but the agent's tool server had mounted only two or three of its plugins. This post covers what was wrong and the three point releases (v0.1.1 to v0.1.3) we shipped on 12 April.

The common factor: a test runs a handful of modules, while the GUI boot compiles more than a hundred. Every one of these bugs needed that volume to show up.

## Where JIT code has to live

Some background on `libinterp/comp-amd64.c` first. Generated code calls back into C runtime helpers with `rel32` calls, so it has to sit within ±2 GB of the emulator's text segment. `jitmalloc()` meets that requirement by trying address hints in 64 KiB steps below and then above the address of `compile` (up to 1023 hints in each direction), and it accepts a mapping only if it lands within about 1.75 GB of the text. That gives a finite number of slots, and nothing reclaims a slot unless someone unmaps it.

## Bug 1: freeing less than we mapped

`compile()` allocated its scratch buffer as `tmpsize = max(8192, size*64)` bytes, but on both the success path and the error path it called `jitfree` with a hard-coded 8192 ([963d3a9](https://github.com/infernode-os/infernode/commit/963d3a98a18e8c645c59064c4172e1784d801d6f)). `jitfree` wraps `munmap`, so for every module larger than the minimum the tail of the mapping leaked and stayed in the near-text region. After about eighty module compiles in the GUI boot the region was full. Then `typecom()`'s next `jitmalloc(8192)` returned NULL, `compile()` raised `exNomem`, and the unhandled exception killed the boot shell while it was loading `tools9p` plugins.

We found the raise site by putting a debug hook on `error()`. The backtrace was:

```
iload -> readmod -> parsemod -> compile -> typecom -> jitmalloc -> NULL
```

The fix moves `tmpsize` to function scope so both cleanup paths free the whole buffer. After it, all twelve `tools9p` plugins loaded.

## Bug 2: one slot per call, even when freed correctly

Freeing correctly wasn't enough. `compile()` and `typecom()` each mapped a fresh near-text buffer for every call, for the pass-0 size estimate. Each of those mappings used up one `jitmalloc` slot, so the slot count kept growing with the number of modules loaded. We made the scratch buffers static and grow-on-demand, so the near-text footprint no longer depends on how many modules load ([51220b7](https://github.com/infernode-os/infernode/commit/51220b737adaf56f384d92c331f7d6af29ebdb14)).

## Bug 3: a sign bit used as a flag

During pass 0, `comcase()` negates the entry count of a `case` table in the module's data to mark it as patched, and expects pass 1 to restore it. If `compile()` fails between the passes (because of a NULL from `jitmalloc`, for example), the count stays negative. The module then falls back to the interpreter, whose `icase`, `casel` and `casec` handlers read `n < 0`, index `t[n*3]` far before the table, load a garbage `R.PC`, and fault on the next dispatch.

So one failure turned into a different, later one, in a different place. The interpreter now treats a negative count as the marker it is and restores it with `n = -n - 1` before using it. The pass-0/pass-1 handshake stays as it was. The guard makes sure an interrupted compile can't corrupt the interpreter's view of the module.

## Bug 4: one mapping per type

`typecom()` builds native initialise and destroy routines for each ADT type. Each one was `jitmalloc`'d separately, using one near-text slot per type, across more than a hundred modules with several types each. When `jitmalloc` failed, `typecom` returned without an error and left `t->initialize = NULL`, and generated code later called through it. We replaced the per-type allocations with a 2 MB bump-allocated slab: one `jitmalloc` serves every type for the whole boot ([a8b3a35](https://github.com/infernode-os/infernode/commit/a8b3a3572d284759d68faaf7cdf527c94feb11ed)). After the fix, the commit records 143 modules JIT-compiled with no crashes, the full `tools9p` load, and an LLM chat round-trip in a second activity.

## A Limbo bug that only the JIT exposed

The crash fixes uncovered one more problem, in Limbo. Task-agent chat tiles came up empty even though the conversation data was in `/n/ui`. The GUI's dispatcher sent events to the conversation and context zones with a non-blocking `alt`. If the receiving process wasn't parked on the channel at the moment of the send, the event was dropped. Under the interpreter that window was small enough that we never saw it. Under the JIT, everything runs faster and the window became wide enough to lose `switchactivity` events routinely. Those sends are blocking now. Redraw hints stay non-blocking, because losing one of those is harmless.

Two more AMD64-specific fixes had landed on 9 April ([b87d7f2](https://github.com/infernode-os/infernode/commit/b87d7f26ba2bbfa61da8094e1e80ae75738945e5)). A PC-alignment check (`R.PC & 3`), written for ARM64 in March, was being applied on every architecture. x86-64 instructions are anywhere from 1 to 15 bytes long, so JIT code addresses there have no alignment. The check is now a `PC_MISALIGNED` macro that is constant zero on x86. Separately, the non-blocking `alt` instruction punted to the interpreter without `TCHECK|WRTPC`, so `R.PC` was stale when an exception fired inside it and the handler lookup missed. The fix uses the flags the ARM64 JIT already passed.

## A test that does what users do

Every one of these bugs got past a suite of correct unit tests, so we added a test that does what a user does. [`tests/host/jit_boot_test.sh`](https://github.com/infernode-os/infernode/blob/master/tests/host/jit_boot_test.sh) launches the emulator with `-c1`, runs the whole GUI boot sequence without an interactive login, and fails on any crash signature (`exNomem`, `SIGSEGV`, `alloc:D2B`, `panic`). It also fails if fewer than all twelve `tools9p` plugins load or if the GUI doesn't initialise. It takes about 30 seconds and runs in CI for the Linux AMD64 jobs ([a64960b](https://github.com/infernode-os/infernode/commit/a64960b60f924ff5f74b097e7ce472521b79136d)).

## v0.1.1, v0.1.2, v0.1.3

We cut three point releases on 12 April:

- **[v0.1.1](https://github.com/infernode-os/infernode/releases/tag/v0.1.1)** adds Linux ARM64, headless and SDL3 GUI, built on ARM64 runners ([e708247](https://github.com/infernode-os/infernode/commit/e708247b1a1268f8573213294581258482cab1b5)). On a Jetson AGX Orin, 298 of 298 JIT correctness tests passed. Our v1 benchmark went from 38,057 ms interpreted to 4,646 ms under the JIT (8.2×), and the v2 benchmark from 2,534 ms to 993 ms (2.6×). It also adds the Linux AMD64 GUI build ([#6](https://github.com/infernode-os/infernode/pull/6)) and the cosign signing that was merged just after v0.1.
- **[v0.1.2](https://github.com/infernode-os/infernode/releases/tag/v0.1.2)** includes the JIT fixes above ([merge](https://github.com/infernode-os/infernode/commit/5a5f0eb0922d42c16f0733b95b8e8fdcac81a311)) and stripped release binaries. It also fixes a duplicated `needs:` line in the release workflow that had quietly dropped the ARM64 jobs from v0.1.1's release.
- **[v0.1.3](https://github.com/infernode-os/infernode/releases/tag/v0.1.3)** adds a multi-arch (amd64 and arm64) container image published to GHCR. It also fixes the first bug our new fuzzer found ([1b20ed0](https://github.com/infernode-os/infernode/commit/1b20ed080e72a8dff1bf34e5480e90ba5946ae36)). A crafted Dis module with a negative signature length got past the bounds check, because `siglen > n` is false when `siglen` is negative. The parse pointer then moved backwards into unmapped memory. The loader now rejects `siglen < 0` explicitly.

That fuzzer came out of supply-chain work tracked by the OpenSSF Scorecard ([c9e0df8](https://github.com/infernode-os/infernode/commit/c9e0df8cdcbf5e735c10038bc1c4d6bf64333f98)), which took us from 6/10 to a projected 8–9. The changes:

- a ClusterFuzzLite harness for the Dis bytecode parser
- SLSA build provenance on releases
- SDL3 pinned to a release tag and commit SHA
- hash-pinned Python requirements in the security workflow
- 13 prebuilt ELF and Mach-O bootstrap binaries deleted from the tree; `makemk.sh` now bootstraps `mk` from source

## What we took from it

None of these bugs was exotic. A size passed to `munmap`, a resource with no reclamation, a flag hidden in a sign bit, a send that assumed a receiver was waiting: each is the kind of bug that survives because nothing exercises it hard enough. Some of the code was new and some came from upstream, but they failed the same way. Each was correct for every load we had run, and wrong for the first load a real user would run.

It also says something about how we work. These fixes were investigated and written with an AI assistant, and each was cheap to find once there was a precise backtrace and a reproducible boot to point at. Without those two things, being fast just meant producing more guesses. So the week's most durable output is not any single fix but `jit_boot_test.sh`, which makes "the system boots under the JIT" something CI checks rather than something we believe.

Next we want the same discipline for the part of the system the whole project exists for: the namespaces that contain agents. A first step landed on 11 April. [`nsaudit`](https://github.com/infernode-os/infernode/commit/fb68ffa55f19cbd65297100037cd54d08508e127) is an advisory analyzer that reads a tool configuration and reports what it actually allows an agent to reach. It enforces nothing, since `nsconstruct`, `FORKNS` and `NODEVS` still do the enforcing at runtime. Its job is to answer, before anything runs, the question a security reviewer asks first.
