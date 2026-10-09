---
title: "Why we forked Inferno: containing agents with namespaces"
description: "InferNode starts here: a 64-bit Inferno® for ARM64 and AMD64, built because per-process namespaces are the right way to contain software agents, and as an experiment in whether AI-assisted development can close a decade of bit rot."
pubDate: 2026-01-23
author: "P. D. Finn"
tags: ["inferno", "security", "arm64", "amd64"]
---

InferNode is a 64-bit distribution of Inferno®, the operating system Bell Labs built after Plan 9. As of this week it builds and runs on Apple Silicon, on ARM64 Linux and on AMD64 Linux, as a hosted emulator with either no GUI or an optional SDL3 one. This first post explains why we took on a system most people last heard of in the late 1990s, and what state it was in when we started.

## The problem we wanted to solve

We have been worried for a while about software agents: programs driven by a language model that read files, run commands and call services for you. An agent like that can do more than its author intended. It can follow an instruction it found in a file, or misread a task and touch something it should not. Asking it to behave is not a containment strategy. What the agent can reach has to be limited by something underneath it that it cannot talk its way past.

Most current approaches start with an agent that has a whole machine and then take things away from it: deny lists, filtered tool calls, permission prompts. The trouble with subtraction is that you have to anticipate everything worth denying.

## Why Plan 9's answer fits

Plan 9 and Inferno had the answer decades ago. Every resource is a file served over 9P: devices, network connections, remote services, the window system. Every process has its own namespace, and a process can only open what is bound into that namespace. Paths that are not bound do not exist for it. If an agent's namespace has no `/n/local`, it cannot read the host disk. Nothing is checking and refusing the request, because there is no path to open.

So the namespace is a capability system, and it is built by addition. You give a process a small tree containing only what it needs, and anything you did not think of stays out by default. Delegation works the same way. A child process can be given a subset of its parent's tree and never more. We have not seen a model that fits agents better. And because agents work through files, they need no SDK, only open, read and write.

Inferno adds a portable VM on top of this. Limbo compiles to Dis bytecode, and the same `.dis` file runs wherever the emulator runs. The headless emulator we built this week is 1.0 MB.

## The catch: bit rot

Inferno was written for 32-bit machines. Upstream development peaked years ago. The [inferno-os/inferno-os](https://github.com/inferno-os/inferno-os) history shows its last sustained burst of work in 2015, followed by a trickle of fixes. Its licence became MIT in March 2021, which made a fork like ours possible, but by then the code was already well behind current hardware. The tree has JIT compilers for 386, 32-bit ARM, MIPS, PowerPC and SPARC, and none for a 64-bit target. There is no modern graphics backend. A 64-bit build compiles and then fails in ways that are hard to trace.

Closing that gap is more than ten years of deferred maintenance, and normally it would take a team that size.

## The experiment

We are therefore running an experiment alongside the engineering: can a small group of people, working closely with AI coding assistants, close a technology gap of a decade or more? The assistants write much of the code and documentation. You can see it in the `Co-Authored-By` trailers in the history. We decide what to build, review the results, run them on real hardware, and throw away what does not hold up.

We have already learned a lesson. The assistants tend to declare success too early. The earlier porting notes put it first on their list of pitfalls: "Builds and doesn't crash" is not "works correctly". The defence is ordinary engineering discipline: tests, running the actual binary, and writing down what is broken. We describe the second one below.

## Where we started

InferNode did not start this week. For about seventeen days before it, we worked in a tree forked from acme-sac, and that is where the 64-bit work began. That tree carried GPL-licensed material, and we wanted the whole distribution under MIT terms like upstream. On 21 January we forked inferno-os and moved the work across. [60e10379](https://github.com/infernode-os/infernode/commit/60e10379c4688a14f010c4ae34d303bfcf6dd4ed) brought over the 64-bit Dis VM, the ARM64 emulator, the formal-verification framework (TLA+, SPIN, CBMC, Frama-C) and the build scripts. [7914379f](https://github.com/infernode-os/infernode/commit/7914379f9fc9a98f79881354c8765e08eb6f6414) added AMD64 Linux. [e3914b1c](https://github.com/infernode-os/infernode/commit/e3914b1c72c0926f9e870192e5757c5d73bfdb90) copied over the rest.

The 64-bit fixes are recorded in the porting notes ([`docs/LESSONS-LEARNED.md` at the time](https://github.com/infernode-os/infernode/blob/b043c0a2/docs/LESSONS-LEARNED.md)). The VM's word had to become pointer-sized:

```c
typedef intptr  WORD;          /* include/interp.h, was int */
IBY2WD = sizeof(void*),        /* include/isa.h */
```

The `*mod.h` headers that the Limbo compiler generates still contained 32-bit frame sizes, and `mk` could not tell they were stale. `BHDRSIZE` counted user data as header overhead. The last blocker was the pool allocator's quanta. At 31, the 32-bit value, modules loaded and bytecode ran, but every program's output disappeared, because block headers overwrote data. A 64-bit free block needs 56 bytes, so the quanta has to be 127. We found that fix by comparing against Caerwyn Jones's [inferno64](https://github.com/caerwynj/inferno64).

## Day one, honestly

Just after midnight on 22 January, one codebase produced a headless build (1.0 MB, no GUI code) and an SDL3 build (1.1 MB, with Xenith, our fork of Acme) ([5524811a](https://github.com/infernode-os/infernode/commit/5524811a)). Twelve minutes later we committed a status report ([79f40cdb](https://github.com/infernode-os/infernode/commit/79f40cdb2466f8712bfa2cda78f61a7daa9dd458)) that ends: "Stop claiming 'complete' - it's not." Basic commands worked. The profile did not load, so there was no namespace. The GUI hung, and `wm` crashed with a bus error. The namespace could be built by hand:

```sh
mount -ac {mntgen} /n &
mkdir -p /n/local
trfs '#U*' /n/local &
```

The profile had been waiting on 9P servers that never exit. The blank SDL3 window came from `libmemdraw.a` and `libinterp.a` built two days before their 64-bit fixes landed ([e11133c3](https://github.com/infernode-os/infernode/commit/e11133c3)). By mid-morning, Xenith was up with the host filesystem at `/n/local`.

We also imported the JITs from the older tree. The AMD64 compiler ([108d49a8](https://github.com/infernode-os/infernode/commit/108d49a8e943f8feaa4d93676f4a17cd4c2fa663), about 2,400 lines) replaced a stub that fell back to the interpreter. The ARM64 one ([cc6dde49](https://github.com/infernode-os/infernode/commit/cc6dde49d15b802cef5fe86b26179893af42a2cb)) is unfinished. It runs `echo`, `cat` and `sh`. Any module that needs more than 32 slots of immediate storage crashes with register X9 set to exactly 1, and `Emuinit` needs 33. The [19 January status report](https://github.com/infernode-os/infernode/blob/cc6dde49d15b802cef5fe86b26179893af42a2cb/docs/arm64-jit/ARM64-JIT-FINAL-STATUS-2026-01-19.md) lists more than twenty attempted fixes that each fail the same way. The same crash happens on a Jetson AGX Orin ([13571c24](https://github.com/infernode-os/infernode/commit/13571c247139f6d7a879b4b1a9f4c6219732688c)). For now, ARM64 runs the interpreter.

## Where this is heading

The order of work is: make the platform trustworthy, then build agents on the namespace model and check that the containment holds. The near-term list is an ARM64 JIT that handles real programs, a namespace that comes up correctly in every launch mode, and tests we can believe.

InferNode is MIT-licensed, like upstream. The name and logo have a separate [trademark policy](https://github.com/infernode-os/infernode/commit/b043c0a2). The source is at [github.com/infernode-os/infernode](https://github.com/infernode-os/infernode).
