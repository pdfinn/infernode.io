---
title: "Three tries at a cage: Veltro and namespace isolation"
description: "Veltro is InferNode's first agent built on the idea that the namespace is the capability. It took three designs in three weeks to get isolation that is simple enough to trust: tool-level checks, NEWNS sandboxes, then FORKNS with bind-replace."
pubDate: 2026-02-15
author: "P. D. Finn"
tags: ["veltro", "namespaces", "security", "agents"]
---

We forked Inferno® to contain software agents with per-process namespaces. This month we built the first agent to test that idea in practice. It is called Veltro, and it went through three isolation designs in about three weeks. The third, merged today as [PR #14](https://github.com/infernode-os/infernode/pull/14), is smaller than the second, has fewer moving parts, and closes a hole the first two did not know about. This post covers why each design was replaced.

## Building up, not filtering down

Before Veltro, the tree had an older agent in `appl/nerv`. It started from the full namespace and filtered it. On 29 January its `spawn` gained real namespace restriction ([0a2cb2f3](https://github.com/infernode-os/infernode/commit/0a2cb2f378b0256dd17841015037981b5e52fba8)). It forked the namespace and bound empty directories over every path that was not allowed. Restricted paths showed up as directories with no entries.

Veltro ([1e89070b](https://github.com/infernode-os/infernode/commit/1e89070b27f06412d056c8b971c43573590a314a), 31 January) inverted the approach. Its tools are files served by `tools9p`, which is given an explicit list and serves nothing else:

```sh
tools9p read list find search    # /tool/read, /tool/list, ...
veltro 'list the files in /appl/cmd'
```

A tool that is not on the list does not exist. Nothing has to refuse it. The agent writes arguments to `/tool/<name>` and reads back the result, so it needs no client library. `spawn` creates sub-agents, and a child's tools and paths must be subsets of its parent's. A child can never be granted something its parent does not have.

## Version 1: some of it was policy

The first spawn ([299d5ae1](https://github.com/infernode-os/infernode/commit/299d5ae11a4883c35c1014730302b7f0803596e6)) used three layers. Tool restriction came from the namespace, because the child got its own `tools9p` serving only the granted tools. Shell commands were also restricted through the namespace ([5f766762](https://github.com/infernode-os/infernode/commit/5f7667623f2bc720699c3659bca5f22b9e1e27c9)): the child's `/dis` was rebuilt to contain only the named `.dis` files, so with `shellcmds=cat,ls` there was no `rm` to run. Path restriction was different. Each tool checked its argument against an allowed list with `pathwithin()`. That is policy code in every tool, and a single tool that forgot the check would undo it. That was the part we did not trust.

## Version 2: NEWNS sandboxes

The second design ([62808002](https://github.com/infernode-os/infernode/commit/62808002e78c1915c220dbf2fa95ecac56741cce), 1 February) moved paths into the namespace too. The parent built a sandbox directory and bound the granted paths into it. The child then entered it with a fixed sequence of `pctl` calls: `NEWPGRP` for an empty srv registry, `NEWENV` so no inherited secrets survive, `NEWFD` with an explicit keep-list, `NODEVS` to block `#U`, `#p` and `#c`, and finally `NEWNS`, which makes the current directory the root. Nine security tests covered it.

It worked, and it was complicated. Binds do not survive `NEWNS`, so the runtime modules every child needs (`bufio`, `string`, `arg`) had to be *copied* into each sandbox. The LLM connection could not be bound either, so it was passed in as an open file descriptor ([a33d3278](https://github.com/infernode-os/infernode/commit/a33d3278bccf9e06f2dd727f3877442a87c777f4)). Sandboxes had to be created, checked against path traversal and removed afterwards. The removal code produced the most alarming bug of the month: `cleanupsandbox()` ran `rmrf` over a directory that still had host paths bound into it. That deletes the originals through the binds. It was fixed in the same commit, by unmounting before removing, but it showed the cost of building namespaces out of real directories.

## Version 3: fork, then replace

The third design ([07bd9403](https://github.com/infernode-os/infernode/commit/07bd9403c45fd189853652eedb6c98b9b745ad96), [781c19ef](https://github.com/infernode-os/infernode/commit/781c19ef49168917b69084309a30080a157369c5)) drops the sandbox. Everything is built from one primitive, `restrictdir(target, allowed)`:

```text
1. make an empty shadow dir  /tmp/veltro/.ns/shadow/{pid}-{seq}/
2. for each allowed item:   bind target/item -> shadow/item   (MREPL)
3. bind shadow -> target                                        (MREPL)
```

After step 3, `target` contains exactly the allowed items. Nothing is copied, no physical directory needs cleaning up, and the process starts from `FORKNS` of a namespace that already works, so there is no bootstrap problem. `restrictns()` applies it in order to `/dis`, `/dis/veltro/tools`, `/dev` (only `cons` and `null`), `/n`, `/lib`, `/tmp` and finally `/`. Attenuation follows directly: a child forks a restricted namespace and can only restrict it further. The spawn path still uses `NEWPGRP`, `NEWENV`, `NEWFD` and `NODEVS` from version 2. `nsconstruct.b` went from 863 lines to 455.

Two details took the most effort.

**The root union.** `emu -r.` binds the host project directory onto `/`, which exposes `.env`, `.git` and the source tree. We first tried binding over the individual entries, which does not work: `dirread()` on a union returns the entries of *every* member. The only way to hide them is to replace the whole root with `restrictdir("/", safe)`.

**Self-mount deadlock.** `tools9p` restricts its own namespace after mounting `/tool`. Calling `stat("/tool")` from its serve loop sends a 9P message to the server that is busy waiting for the `stat`. For the root, `restrictdir` now creates mount points without calling `stat` and treats bind failures as non-fatal.

## The hole we found

On the day of the merge we found a hole that none of the three designs had addressed ([ae6bf07b](https://github.com/infernode-os/infernode/commit/ae6bf07b675911b29b3077c18fb19a18438becd7)). Xenith serves its windows at `/chan`, and `/chan` was on the root allowlist. Any agent could read the body of every open window, including windows that had nothing to do with it. Now `/chan` is bound only when the `xenith` tool is granted. The REPL opens its own window's files *before* restricting, so it keeps its window without seeing the others.

The lesson is about where to look. Namespace isolation is only as good as the allowlist, and the allowlist is easy to treat as boilerplate. Every name on it carries authority, and each one deserves the same scrutiny as the mechanism.

## On building this with assistants

Like the rest of InferNode, Veltro was written with AI coding assistants, and here an agent was helping to build the walls meant to contain agents. That makes review matter more. One small example: the v3 plan estimated about 200 lines for `nsconstruct.b`, and that figure was copied into several documents after the code turned out to be 455 lines. We corrected them ([d343ae7e](https://github.com/infernode-os/infernode/commit/d343ae7ea7b8e781e5e0a2a745ed4f89442e6f47)). A plan's estimate is not a measurement. For security claims we hold to that rule: [appl/veltro/SECURITY.md](https://github.com/infernode-os/infernode/blob/master/appl/veltro/SECURITY.md) describes what the mechanism does, and the 9 security tests and 3 concurrency tests check it.

## Next

What we have is a design and tests we wrote ourselves, and we wrote both with the same assumptions. The next step is to try to break it: a restricted agent should not be able to name anything outside its tree, by any route. We know of the `#` device names, `/chan`, the root union and inherited file descriptors. We want to find the routes we have not thought of.
