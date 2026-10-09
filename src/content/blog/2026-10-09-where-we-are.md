---
title: "Nine months in: closing the gap, and an invitation"
description: "We set out to turn Acme into an AI text editor, and ended up bringing Inferno® back as a modern 64-bit operating system: agents, a new desktop, new cryptography, bare metal and a modern browser. Here is where that stands in October 2026, and how you can help."
pubDate: 2026-10-09
author: "P. D. Finn"
tags: ["project", "security", "community"]
---

This project started with a text editor. We wanted to turn Acme into an AI text editor. Caerwyn Jones's Acme SAC, which packages Acme as a standalone editor, showed us it could be done, and we got our own version working. That fork of Acme became Xenith. We also had a conviction behind it. Software agents were going to reach past what they were given, and Plan 9 and Inferno® had worked out the right way to contain them decades ago: a per-process namespace, where everything is a file and anything not bound into your tree does not exist for you.

To do what we wanted, Inferno® had to become a modern system first. That turned the project into an experiment. Inferno® had gone more than ten years without serious maintenance. It was 32-bit, it had no JIT for any current processor, and much of it had rotted. Could a small group of people, working closely with AI coding assistants, close a gap that size?

Nine months and more than 2,800 commits later, our answer is yes. This series has told the story in order. Here is how it fits together.

## The experiments

**Could we port Inferno® to 64-bit?** That was the [first experiment](/blog/why-infernode/), and everything else rested on it. Within weeks Inferno® ran on macOS and Linux on ARM64 and on Linux AMD64, with [JIT compilers for both architectures](/blog/two-jits/). A third JIT, for [64-bit RISC-V](/blog/risc-v/), followed in September.

**Could an agent live inside Inferno®?** On 12 February, [Veltro](/blog/veltro/) went live. It is an agent whose capabilities are its namespace, it runs in Xenith, and it can speak and listen. We call that day its birthday.

**Could Inferno® reach people who have never used Acme?** Partway through, we realised we had far more than an editor. Most people should not need to learn Acme's command language to use an agent. So we built [Lucia](/blog/lucia/), a simpler desktop on the same foundations.

**Could AI-assisted development produce robust cryptography?** Inferno®'s cryptography was as dated as everything else. We built [native TLS 1.3](/blog/native-tls-13/), retired RC4 from login, added [ML-KEM, ML-DSA and SLH-DSA](/blog/post-quantum-in-libsec/), and brought the node-to-node handshake [to post-quantum strength](/blog/post-quantum-between-nodes/). We did not take that code on trust. It is checked against standard test vectors, stress runs and CBMC, and those checks are how it became robust.

Along the way we cleared out the rest of the bit rot. InferNode ships for macOS, Linux and Windows and [runs on Android](/blog/android-in-four-days/). The GUI went [back to Tk](/blog/back-to-tk/), and we wrote the [design principles](/blog/writing-down-the-way/) down so that people and agents build the same way.

## Full circle: bare metal

Inferno® was always meant to run on small devices without a host operating system underneath. The work of the past month brings it back there. InferNode now boots natively [on a 64-bit Raspberry Pi](/blog/infernode-on-bare-metal/), with its own kernel, drivers, network stack and window manager, and the 0.5.0 kernel [held up through a 48-hour soak](/blog/infernode-0-5-0/). Inferno® is a full-fledged operating system again. It is an operating system for embedded-class boards, but a real one.

## The last big challenge: a real browser

The Plan 9 world has never had a modern, standards-compliant web browser. Inferno® had Charon, a 1990s design that could not express what CSS means. So the final challenge was to [bring Charon back](/blog/charon/) with a new engine built the way Bell Labs would build one. It follows the HTML and CSS specifications stage by stage, it is a file server that agents can drive through `/mnt/charon`, and it is measured against the Web Platform Tests. It passes Acid2. Xenith now renders HTML with it, and it is improving every week.

## The security claim, tested

Containing agents is why the project exists, so we have tested that claim adversarially. We [model-checked the namespace code](/blog/checking-the-namespace-claim/), [tightened every path into an agent's namespace](/blog/tightening-agent-namespaces/), and built [the escape room](/blog/the-escape-room/). It started as a small test of whether anything inside a Veltro namespace could get out. It grew into a protocol: a live adversarial model is given the source and told to recover canaries it was never granted, on isolated machines, with audited evidence.

The escape room found problems, including [after we shipped 0.4.0](/blog/escape-room-0-4-1/). Every one was in how a namespace was constructed or in inherited implementation code, not in the namespace model itself. We fixed each one and added a test for it. The harness lives in its own repository, [infernode-escape-room](https://github.com/infernode-os/infernode-escape-room), behind CI guards that keep it out of every release. A passing campaign supports a bounded claim: for this build, this namespace construction, this model, this prompt and these trials, no ungranted canary was read or modified. The broader argument for why the namespace is the right boundary is in [our paper on namespace-bounded agents](PAPER_URL).

## Why we are asking now

For most of this year, inviting people in would have meant asking them to help with bit rot. That phase is over. The system builds from a clean clone, ships on every major platform, runs on bare metal, has a test suite that CI enforces, and has a containment model that has held against an adversary trying to break it. The remaining gaps are the interesting ones, and they need more people than we have.

## How to help

- **Plan 9 and Inferno® people.** You know this system's idioms better than anyone. Review our 9P services and namespace construction against how it was meant to be done. The [design principles](https://github.com/infernode-os/infernode/blob/master/docs/DESIGN-PRINCIPLES.md) are a good place to start.
- **Systems and kernel programmers.** The JITs, the bare-metal kernels and the device drivers have the most open ground. The RISC-V port wants real boards.
- **Web platform people.** Charon's engine is new, readable and spec-driven, and there is plenty of the Web Platform Tests still to pass.
- **Security researchers and red teamers.** Run the escape room. Write scenarios we did not think of. Try to break the cryptography. Report what you find through [SECURITY.md](https://github.com/infernode-os/infernode/blob/master/SECURITY.md).
- **Formal methods people.** The TLA+, SPIN and CBMC models are bounded. Help us push the bounds further.
- **Commercial teams.** If you need agents that cannot reach past their grant, on a laptop, a phone, an embedded board or a server, talk to us about deploying it. InferNode is MIT-licensed.

The [quick start](/docs/quick-start/) takes a few minutes, and the source is at [github.com/infernode-os/infernode](https://github.com/infernode-os/infernode). We started this to build something we wanted to exist. We would like to build the rest of it with people who want it too.
