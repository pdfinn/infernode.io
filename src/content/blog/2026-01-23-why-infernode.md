---
title: "Why InferNode: an AI text editor, a 64-bit Inferno and a place to contain agents"
description: "InferNode began as an attempt to turn Acme into an AI text editor, inspired by Acme SAC. That needed a 64-bit Inferno®, which became our first experiment in AI-assisted development, and the namespace model turned out to be the right home for agents."
pubDate: 2026-01-23
author: "P. D. Finn"
tags: ["inferno", "xenith", "arm64", "security"]
---

InferNode is a 64-bit distribution of Inferno®, the operating system Bell Labs built after Plan 9. As of this week it builds and runs on Apple Silicon, on ARM64 Linux and on AMD64 Linux, as a hosted emulator with either no GUI or an optional SDL3 one. This post explains how we got here: we set out to build an editor, found we needed an operating system, and realised the operating system was the more important part.

## It started with Acme

Acme is the text environment Rob Pike built for Plan 9. Everything in it is text, any text can be executed or opened with a mouse button, and every window is a set of files: body, tag, address, control, events. A program that can read and write files can drive Acme. That is exactly the interface a language model needs. A model that can write `/mnt/acme/new` and read a window's `body` needs no plugin API, no SDK and no protocol beyond file I/O.

Our model for the project was Caerwyn Jones's [Acme SAC](https://github.com/caerwynj/acme-sac), "Acme Stand Alone Complex". Acme SAC took Acme out of Plan 9 and packaged it as a self-contained Inferno® system: the editor, the shell, the namespace and the VM, running as one program on an ordinary desktop. We wanted that, with a language model as a working partner inside the editor rather than a chat window beside it.

So we got Acme SAC running on current hardware, forked its Acme, and started adding what an AI collaborator needs. The fork is called Xenith. Its windows are still files under `/mnt/xenith`, and it adds what we found missing: images displayed in the same windows as text, a dark theme, and per-window colours a program can set through a `colors` file, so a human can tell at a glance which windows an agent is working in.

## Inferno had to become 64-bit

The obstacle was underneath the editor. Inferno was written for 32-bit machines, and Acme SAC carried that assumption. Apple Silicon and modern Linux servers are 64-bit only in every way that matters, and a 64-bit build of Inferno compiles and then fails in ways that are hard to trace.

That made the 64-bit port our first experiment in AI-assisted development. The question was simple: could a small team, working closely with AI coding assistants, port a 1990s virtual machine and its runtime to 64-bit, a job that normally needs people who already know the code intimately? The assistants wrote much of the code and the porting notes; we chose what to attempt, reviewed the results and ran them on real machines. The `Co-Authored-By` trailers in the history show who wrote what.

The first working ARM64 build came together between 3 and 6 January, in a tree based on acme-sac ([`COMPLETE.md`](https://github.com/infernode-os/infernode/blob/e3914b1c72c0926f9e870192e5757c5d73bfdb90/COMPLETE.md)). The porting notes ([`docs/LESSONS-LEARNED.md` at the time](https://github.com/infernode-os/infernode/blob/b043c0a2/docs/LESSONS-LEARNED.md)) record the fixes in the order they were found. The VM's word had to become pointer-sized:

```c
typedef intptr  WORD;          /* include/interp.h, was int */
IBY2WD = sizeof(void*),        /* include/isa.h */
```

The `*mod.h` headers that the Limbo compiler generates still contained 32-bit frame sizes, and `mk` could not tell they were stale, so the compiler and every generated header had to be rebuilt. `BHDRSIZE` counted user data as header overhead. The last blocker was the pool allocator's quanta. At 31, the 32-bit value, modules loaded and bytecode ran, but every program's output disappeared, because block headers overwrote data. A 64-bit free block needs 56 bytes, so the quanta has to be 127. We confirmed that fix by comparing against Caerwyn Jones's [inferno64](https://github.com/caerwynj/inferno64).

The experiment answered its question. The port works, and the same approach now goes into everything else.

## Why the operating system matters more than the editor

Once a language model could drive an editor through files, the next question was obvious: what else can it reach? An agent that reads files, runs commands and calls services can do more than its author intended. It can follow an instruction it found in a file, or misread a task and touch something it should not. Asking it to behave is not containment. What it can reach has to be limited by something underneath it that it cannot talk its way past.

Most current approaches start with an agent that has a whole machine and then take things away: deny lists, filtered tool calls, permission prompts. Subtraction means anticipating everything worth denying.

Plan 9 and Inferno had the answer decades ago. Every resource is a file served over 9P: devices, network connections, remote services, the window system. Every process has its own namespace, and a process can only open what is bound into it. If an agent's namespace has no `/n/local`, it cannot read the host disk. Nothing checks and refuses the request; there is no path to open. The namespace is a capability system built by addition. You give a process a small tree containing only what it needs, and anything you did not think of stays out by default. A child can be given a subset of its parent's tree and never more.

Xenith's design follows from this. Its windows are files, so an agent's access to them is a matter of what is bound into its namespace, like everything else.

## Moving to the MIT tree

Acme SAC's tree carried GPL-licensed applications, including the Limbo compiler, and LGPL interpreter code. We wanted the whole distribution under the MIT terms that upstream Inferno adopted in 2021. On 21 January we forked [inferno-os/inferno-os](https://github.com/inferno-os/inferno-os) and moved seventeen days of work across. [60e10379](https://github.com/infernode-os/infernode/commit/60e10379c4688a14f010c4ae34d303bfcf6dd4ed) brought over the 64-bit Dis VM, the ARM64 emulator, the formal-verification framework (TLA+, SPIN, CBMC, Frama-C) and the build scripts. [7914379f](https://github.com/infernode-os/infernode/commit/7914379f9fc9a98f79881354c8765e08eb6f6414) added AMD64 Linux. [e3914b1c](https://github.com/infernode-os/infernode/commit/e3914b1c72c0926f9e870192e5757c5d73bfdb90) brought the rest, Xenith included.

Upstream had been quiet for a long time. Its history shows the last sustained burst of work in 2015, followed by a trickle of fixes. The tree has JIT compilers for 386, 32-bit ARM, MIPS, PowerPC and SPARC, none for a 64-bit target, and no modern graphics backend. That is the gap we intend to close.

## The first two days

Just after midnight on 22 January, one codebase produced a headless build (1.0 MB, no GUI code) and an SDL3 build (1.1 MB, with Xenith) ([5524811a](https://github.com/infernode-os/infernode/commit/5524811a)). Two problems remained from the move, and both were fixed that morning. The profile had been waiting on 9P servers that never exit, so it now starts them asynchronously and the namespace comes up:

```sh
mount -ac {mntgen} /n &
mkdir -p /n/local
trfs '#U*' /n/local &
```

The SDL3 window was blank because `libmemdraw.a` and `libinterp.a` had been built two days before their 64-bit fixes landed; rebuilding them brought Xenith up with the host filesystem at `/n/local` ([e11133c3](https://github.com/infernode-os/infernode/commit/e11133c3)). The same day, `docs/XENITH.md` set out what Xenith is for ([053b2838](https://github.com/infernode-os/infernode/commit/053b28384c7a7b5a05932982637f13ee26a200b0)): the filesystem as the API, namespaces as access control, and every agent action visible to the human.

We also brought over the JITs. The AMD64 compiler ([108d49a8](https://github.com/infernode-os/infernode/commit/108d49a8e943f8feaa4d93676f4a17cd4c2fa663), about 2,400 lines) replaced a stub that fell back to the interpreter. The ARM64 compiler ([cc6dde49](https://github.com/infernode-os/infernode/commit/cc6dde49d15b802cef5fe86b26179893af42a2cb)) runs `echo`, `cat` and `sh`, but any module that needs more than 32 slots of immediate storage crashes with register X9 set to exactly 1, and `Emuinit` needs 33. The [19 January status report](https://github.com/infernode-os/infernode/blob/cc6dde49d15b802cef5fe86b26179893af42a2cb/docs/arm64-jit/ARM64-JIT-FINAL-STATUS-2026-01-19.md) narrows it down, and the same crash reproduces on a Jetson AGX Orin ([13571c24](https://github.com/infernode-os/infernode/commit/13571c247139f6d7a879b4b1a9f4c6219732688c)). Until that is fixed, ARM64 runs the interpreter.

## Where this is heading

The order of work is: make the platform solid, put a language model to work inside Xenith, and build agents whose reach is defined by their namespace. The near-term list is an ARM64 JIT that handles real programs, a namespace that comes up correctly in every launch mode, a test suite we can rely on, and the first agent tools served as files.

InferNode is MIT-licensed, like upstream. The name and logo have a separate [trademark policy](https://github.com/infernode-os/infernode/commit/b043c0a2). The source is at [github.com/infernode-os/infernode](https://github.com/infernode-os/infernode).
