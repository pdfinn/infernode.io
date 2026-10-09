---
title: "Writing down the way: design principles for people and agents"
description: "Seven months in, the hardest thing to keep was not code but the shape of it. We wrote the Plan 9 head-space down, for human contributors and for the AI coding assistants we build with."
pubDate: 2026-08-22
author: "P. D. Finn"
tags: ["design", "namespace", "9p", "process"]
---

InferNode began from one bet and one experiment. The bet was that Plan 9 and Inferno® had the right security model for a world in which software agents act on our behalf. Every process has its own namespace, every resource is a file, and what is not in your namespace you cannot reach. When we forked, Inferno had not had an upstream release in about a decade and needed a lot of work just to build and run on current machines. The experiment was whether a small group, working closely with AI coding assistants, could close that gap quickly without losing what made the system worth reviving.

By August the first half of that was clearly happening. The second half had a new problem. Code was arriving faster than the design tradition could be passed on by example. That applied to human contributors who learned systems programming on Unix and the web, and it applied to the assistants, whose defaults come from the same places. Both kept reaching for a REST endpoint, a JSON config, a policy check in the middle, or a client library. Each of those is reasonable somewhere else. Here each one bypasses the namespace, breaks composition with the tools, or adds a second security chokepoint.

This week we wrote the tradition down.

## One document, one rule

[docs/DESIGN-PRINCIPLES.md](https://github.com/infernode-os/infernode/blob/master/docs/DESIGN-PRINCIPLES.md) ([#513](https://github.com/infernode-os/infernode/pull/513)) collects what had been spread across about ten files: the zero-trust compliance document, Veltro's security model, the namespace layout and the 9P data conventions. Its opening line states the audience: "for human contributors and AI agents alike."

If a contributor takes away one procedural rule, it should be this: **design the file interface first, and show it to us before you build.** A new service starts life as a namespace sketch in an issue: the tree, what each file reads and writes, and an example session.

```sh
; cat /mnt/sensors/station-1/temperature
22.5
; echo poll 30 > /mnt/sensors/ctl
```

A twenty-line sketch can be reviewed in minutes, and most design errors are visible in it. Three weeks of code cannot be reviewed that quickly. Sketch-first is now policy: an interface PR without a proposal issue is returned ([#516](https://github.com/infernode-os/infernode/pull/516)).

## Wrong and right, from our own tree

The section we expect to be cited most is "Mechanism, not policy". It is a catalogue of decisions this codebase actually made, each one showing the wrong version, the right version, and the reason.

Path restriction is the clearest case. The wrong version was a check inside a tool that returned `ERROR: path not granted`. The `exec` tool bypassed it completely, because shell command arguments cannot be parsed reliably. The right version binds a shadow directory so that ungranted paths do not exist, and that covers every route at once because every route goes through name resolution. The document puts it this way: "Policy code guards a door; the namespace removes the room."

The wallet's signing file is the opposite case, where narrowing the namespace was not enough. Signing a 32-byte hash chosen by an attacker can authorise an arbitrary transfer, so that capability is dangerous whoever holds it. The fix was to stop offering it at all, and to expose structured `pay` proposals that the wallet validates and checks against a budget. The general lesson: when an interface can't be attenuated into safety, remove it.

The document also includes a table of smells for reviewers: JSON crossing a 9P interface, an "access denied" reachable by a confined process (denial should be absence), a second copy of a security predicate, `&&` in an Inferno shell script. Each row asks a question rather than issuing a ban. JSON is right at external boundaries. The smell is finding it inside the namespace, doing a job the namespace does better.

## Text, not JSON, argued properly

The no-JSON rule got the most revision ([#524](https://github.com/infernode-os/infernode/pull/524), [#525](https://github.com/infernode-os/infernode/pull/525)), and it improved under argument. The architectural case now comes first: tool composition, parseability and consistency. The strongest objection is also answered on its merits. That objection is schema evolution, the one honest argument for JSON. The tradition already answers it with ndb-style `attr=value` records, which are named and order-independent, and which this tree already uses for audit records and `nsaudit -m`. The guidance picks a form by stability: positional fields for stable, dense records, `attr=value` for records that evolve, and a hierarchy of files for entity state.

The paragraph on agents was trimmed to what we can support. An agent here never emits a schema. Structure lives in the namespace and validation happens at the server, so a semantic error is rejected where it arrives instead of hiding inside well-formed output.

## Playbooks that agents and people both read

The principles doc is the reasoning. The day-to-day mechanics went into five project skills under `.claude/skills/`: `ninep-server`, `limbo-dev`, `limbo-test`, `gui-test` and `emu-dev`. They are plain Markdown, written so that a person or an assistant can follow them, and they cover what keeps tripping both up. Examples are the wrong-target trap, where compiling to a path nothing loads makes a fix look like it did nothing; the emulator test that never exits, so the harness must stop it; and the rule that a 9P fid is the session.

`AGENTS.md` became the single entry point. It is the file contributors point their assistants at, and it links everything else. [docs/INFERNO-SHELL.md](https://github.com/infernode-os/infernode/blob/master/docs/INFERNO-SHELL.md) ([#523](https://github.com/infernode-os/infernode/pull/523)) gave the rc-style shell its own reference, because "shell" in this repository means two dialects that are not interchangeable. [docs/TUTORIAL-9P-SERVICE.md](https://github.com/infernode-os/infernode/blob/master/docs/TUTORIAL-9P-SERVICE.md) ([#515](https://github.com/infernode-os/infernode/pull/515)) works through a complete service, `countfs`. It goes from sketch to man page, and every artifact ships and is checked in CI.

We also scoped one rule more tightly ([#521](https://github.com/infernode-os/infernode/pull/521)). Limbo governs the in-tree core. A connector can be written in any language, because anything that serves 9P integrates.

## Testing the guidance against a real failure

A document like this is only useful if it would actually have prevented wasted work, so we tested it. The trigger had been a voice-input PR, #421, that came in designed the foreign way and needed major revision. We ran a counterfactual review: if the docs had existed, which of its defects would they have caught? The architectural defects scored well. The consistent blind spot was every boundary with the host: pinning and checksumming anything fetched, never executing a file written by the host at boot, and the emulator's kernel-process kill path. Eight gaps were filed and closed in [#516](https://github.com/infernode-os/infernode/pull/516), and that review is also where the `emu-dev` skill came from.

[#518](https://github.com/infernode-os/infernode/pull/518) then audited every code citation in the docs. An example is an endorsement, so it should point at code that is actually exercised. The `ninep-server` skill had cited a tool module that is not registered, so it was never loaded. It now cites one that runs.

## An honest ceiling

Two parts of the document matter most to us. The first is "The honest boundaries". The namespace confines code absolutely but cannot confine what a sentence does to a language model. Formal results hold only within their stated bounds. `nsaudit` passing means only that it found none of the compositions it knows to check for. It does not mean "safe".

The second is how the document stays current. Reviewers cite sections rather than opinions. A miss gets filed as a `principles-gap` issue. Facts that change over time live in the skills, where they are expected to be maintained.

Last, a style gate, `tools/style-gate.sh`, flags POSIX-isms in Inferno-side scripts and new JSON users in `appl/` on each PR. For now it only warns. At introduction it found five issues, all in legacy build scripts.

None of this is new thinking. It is Plan 9's thinking, written down for contributors who were never taught it, whether they are people or assistants. The question we are now asking is a harder one: if the namespace is the security model, does it hold when something inside is actively trying to get out?
