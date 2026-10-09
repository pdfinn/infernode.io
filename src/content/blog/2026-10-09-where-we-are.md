---
title: "Nine months in: closing the gap, and an invitation"
description: "We forked Inferno® to contain AI agents with namespaces, and to find out whether a small team working with AI could close a decade-old gap. Here is where that stands in October 2026, and how you can help."
pubDate: 2026-10-09
author: "P. D. Finn"
tags: ["project", "security", "community"]
---

In January we [forked Inferno®](/blog/why-infernode/) for two reasons. The first was a security argument. Software agents driven by language models were going to try to reach past what they were given, and the right way to contain them was the one Plan 9 and Inferno® worked out decades ago: a per-process namespace, where everything is a file and what is not bound into your tree does not exist for you. The second was an experiment. Inferno® had gone more than ten years without serious maintenance. It was 32-bit, it had no JIT for any current 64-bit processor, and its graphics were dated. We wanted to know whether a small group of people, working closely with AI coding assistants, could close a gap like that.

Nine months and more than 2,800 commits later, we think the answer to the second question is yes. The first question is now well tested, and the testing has been adversarial.

## What closing the gap looked like

This series has told that story in order. Here is the short version.

- **The VM got fast on modern hardware.** InferNode now has JIT compilers for [ARM64 and AMD64](/blog/two-jits/), and since September for [64-bit RISC-V](/blog/risc-v/). One unload bug turned out to affect all three, and we found it because there were three.
- **The cryptography caught up.** We added [native TLS 1.3](/blog/native-tls-13/). We retired RC4 from login and [added ML-KEM, ML-DSA and SLH-DSA](/blog/post-quantum-in-libsec/), and brought the node-to-node handshake [to post-quantum strength](/blog/post-quantum-between-nodes/). Test vectors and stress runs found real bugs in our own code before anyone else did, and we wrote about each one.
- **It runs where people are.** It ships for macOS (signed and notarized), Linux and Windows, and [on Android](/blog/android-in-four-days/). It also boots [on bare metal](/blog/infernode-on-bare-metal/): a Raspberry Pi got a native kernel and a window manager in nine days, and the 0.5.0 kernel [ran a 48-hour soak](/blog/infernode-0-5-0/).
- **The system stopped lying to us.** Bytecode no longer [lives in git, drifting from its source](/blog/infernode-0-4-0/). We [went back to Tk](/blog/back-to-tk/) when our own toolkit cost more than it gave. The [design principles](/blog/writing-down-the-way/) are written down, so people and agents build the same way.

None of that would have been possible for a team our size on the old economics. AI-assisted development has made us faster, but it has not removed the need for engineering discipline. Most of the lessons in these posts are the same lesson: an assistant will tell you something works before it does. The defences are tests that run themselves, checks in CI instead of rules people have to remember, hardware instead of assumptions, and honest status reports. When we leaned on those, the speed was real.

## The claim, under attack

The security argument is the reason the project exists, so we have tried hard to break it.

First we [checked our own models](/blog/checking-the-namespace-claim/) and found that the original isolation property was a tautology that could never fail. Then we [tightened agent namespaces](/blog/tightening-agent-namespaces/) leak by leak, and learned that the restriction mechanism held while the leaks were in what we fed it. Then we built [the escape room](/blog/the-escape-room/). It started as a toy for asking whether anything inside a Veltro namespace could get out, and grew into a protocol: a live adversarial model, given the source and told to recover canaries it was never granted, run on isolated machines with audited evidence.

It found escapes. Delegation could amplify a toolset, and `..` traversal could walk out through a pre-4e mount implementation. After we shipped 0.4.0, it [found more](/blog/escape-room-0-4-1/). Every one was in how we constructed or fed a namespace, or in inherited implementation code. None was in the namespace model itself. Each one was fixed, and each fix came with a test. The harness now lives in its own repository, [infernode-escape-room](https://github.com/infernode-os/infernode-escape-room), behind CI guards that keep it out of every release.

We are careful about what a passing campaign means. It supports a bounded claim: for this build, this namespace construction, this model, this prompt and these trials, no ungranted canary was read or modified. It does not prove that every namespace is secure. The broader argument for why the namespace is the right boundary is in [our paper on namespace-bounded agents](PAPER_URL).

## Why we are asking now

For most of this year, inviting people in would have meant asking them to help with bit rot. That phase is largely over. The system builds from a clean clone, ships on every major platform, has a test suite that CI enforces, and has a containment story that has survived an adversary actively trying to break it. The remaining gaps are the interesting ones, and they need more people than we have.

## How to help

- **Plan 9 and Inferno® people.** You know this system's idioms better than anyone. Review our 9P services and namespace construction against how it was meant to be done, and tell us where we have drifted. The [design principles](https://github.com/infernode-os/infernode/blob/master/docs/DESIGN-PRINCIPLES.md) are where to start arguing.
- **Systems and kernel programmers.** The JITs, the bare-metal kernels and the device drivers have the most open ground. The RISC-V work has so far run only under QEMU, and the PolarFire boards need people with the hardware.
- **Security researchers and red teamers.** Run the escape room. Write scenarios we did not think of. Try to break the cryptography. Report what you find through [SECURITY.md](https://github.com/infernode-os/infernode/blob/master/SECURITY.md), and we will write it up as openly as we have written up our own mistakes.
- **Formal methods people.** The TLA+, SPIN and CBMC models are bounded. Help us push the bounds and close the races they found.
- **Commercial teams.** If you need agents that cannot reach past their grant, on a laptop, a phone, an edge board or a server, talk to us about what you would need to deploy it. InferNode is MIT-licensed.

The [quick start](/docs/quick-start/) takes a few minutes, and the source is at [github.com/infernode-os/infernode](https://github.com/infernode-os/infernode). We started this to build something we wanted to exist. We would like to build it with people who want it too.
