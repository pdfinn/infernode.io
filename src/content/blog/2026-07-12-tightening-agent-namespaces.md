---
title: "Two weeks of tightening agent namespaces"
description: "Since v0.3.0 we have merged more than fifty security changes to how Veltro builds an agent's namespace. Most were small. What they had in common was granting too much: by existence, by inheritance, by list order, or through a deputy."
pubDate: 2026-07-12
author: "P. D. Finn"
tags: ["security", "veltro", "namespaces"]
---

The reason this project exists is a claim. If you give an AI agent a Plan 9 or Inferno® namespace, it cannot reach what is not in that namespace, however capable it is and whatever a prompt injection tells it to do. We made that claim before agents escaping their confines was a common worry, and we forked a long-neglected operating system to test it. This chapter covers the two weeks in which we tested it hardest against ourselves.

Veltro's security model rests on one Inferno primitive. `restrictdir(target, allowed, writable)` builds a shadow directory containing only the allowed entries and bind-replaces the target with it. Whatever is not in the shadow cannot be reached, because in the agent's namespace it does not exist. A child agent forks a namespace that is already restricted and can only narrow it further. The mechanism is small, and model behaviour does not affect it.

That leaves the inputs: which paths, which tools, which flags reach `restrictns()`. From 28 June to 11 July, 54 commits titled `fix(security)`, `test(security)` and similar landed on master. Almost every one closed a case where the input to the mechanism granted more than intended.

The volume comes from how we ran this. It was an audit: the PRs are written as security findings, each with a fix and a regression test that probes for that one leak. Building InferNode with AI coding assistants is what made it practical to do the audit as dozens of small changes, each one separately tested and reviewed, rather than as one large patch nobody could check. We also began running agents against the real message pipeline with scripted scenarios from a separate evaluation harness, which is kept out of the shipped tree ([#330](https://github.com/infernode-os/infernode/pull/330)).

This chapter groups the fixes by how the excess got in. The current model is written up in [appl/veltro/SECURITY.md](https://github.com/infernode-os/infernode/blob/master/appl/veltro/SECURITY.md).

## Granted because it existed

`restrictns` used to give any child `/mnt/llm`, and later `/mnt/msg`, whenever the directory existed. A running deployment always has `/mnt/llm`, so every confined child could see the whole model-service tree. Our test claimed this was correct. It asserted the by-existence grant, and it only passed because the test environment ships no real `/mnt/llm`.

[#329](https://github.com/infernode-os/infernode/pull/329) made `/mnt` depend only on capabilities: a child sees a `/mnt` subtree only if its `caps.paths` names it. The agent loop opens its LLM session by path after restriction, so it adds `/mnt/llm` to its own list explicitly. A spawned sub-agent doesn't need the mount at all. It inherits an already-open session file descriptor, because an open fd survives namespace restriction.

## Granted by inheritance or by list order

[#338](https://github.com/infernode-os/infernode/pull/338) changed what one tool call can see. `tools9p` forks and restricts a namespace for every invocation. Before this change, that namespace received the authority of every tool registered for the agent. If the agent had `wallet` anywhere in its menu, a `cat` it ran could see `/n/wallet`. Now the namespace receives only the invoked tool's authority:

```limbo
# Attenuate to the current operation. The agent may have many tools in its
# menu, but this child namespace receives only the invoked tool's authority.
toolnames := invokedtool :: nil;
```

`/chan` (Xenith windows), `/n/speech`, `/phone` and `/n/wallet` are now each granted only for the tool that needs them. The same PR fixed `pathperm`. It used to return the permission of the first grant that matched, so a broad `rw` grant listed before a narrower `ro` grant would override it purely because of order. Now the narrowest grant wins, and on a tie, `ro` wins. Other commits in the series hid inherited file descriptors, node identity state and the parent's environment from agents. Under `/env`, agents now see only `VELTRO_SESSION`, so host credential variables never become capabilities.

There was also a fail-open path. If `veltro` could not load the namespace constructor, or if `FORKNS`, `NODEVS` or the restriction itself failed, it printed a warning and carried on unconfined. [#319](https://github.com/infernode-os/infernode/pull/319) makes each of those raise `fail:namespace`.

## Granted through a deputy

Some tools act on the agent's behalf with more authority than the agent has. Two examples:

- An agent that cannot read a file could ask the `launch` tool to open Charon on `file:///that/file`, then read the rendered page back through Charon's control files. [#334](https://github.com/infernode-os/infernode/pull/334) restricts launch data to `http://` and `https://`. It also refuses to let an HTTP response redirect the browser to a non-network scheme. [#356](https://github.com/infernode-os/infernode/pull/356) blocks the same network-to-local transition for links.
- Agent web tools, and then Charon, could be pointed at private addresses. [#344](https://github.com/infernode-os/infernode/pull/344) factors out a shared `publicnet` module that resolves the host through `/net/cs` and only dials the address it resolved to. It refuses loopback, RFC 1918, link-local, CGNAT, multicast and the documentation ranges. If the name resolves to something other than IPv4, the request is denied.

The editor tool got the same treatment ([#333](https://github.com/infernode-os/infernode/pull/333)), as did `exec` against read-only grants ([#374](https://github.com/infernode-os/infernode/pull/374)).

## Effects as proposals

Message handling went through three versions in nine days, and the last one is the pattern we now apply everywhere. Initially a drafting agent was given `/mnt/msg` whole. It could see the `reply` file, treated it as "send", and was refused, which is a gate rather than a capability. [#337](https://github.com/infernode-os/infernode/pull/337) narrowed a bare `/mnt/msg` grant to the read-only status surface. [#343](https://github.com/infernode-os/infernode/pull/343) then made replies require one-shot approval. [#359](https://github.com/infernode-os/infernode/pull/359) settled on a split between proposal and commit. An agent with an exact `/mnt/msg/draft` grant can only queue immutable reply proposals. A trusted controller outside the model's namespace reads `/mnt/msg/pending` and consumes each one once through `approve` or `deny`. Wallet payments now work the same way ([#360](https://github.com/infernode-os/infernode/pull/360)): an agent writes `pay` proposals and never sees `ctl`, `pending` or `new`.

SECURITY.md states the principle: "proposal files are not effect capabilities." The model cannot create the authority to commit, so a prompt injection that makes the model try to send a message produces a draft, not a sent message.

## Refusing grants that should never be made

The last group validates the grants themselves:

- **Delimiters.** Capability lists are text, so a path containing a newline, carriage return, tab or comma could inject a second grant. [#386](https://github.com/infernode-os/infernode/pull/386) rejects those characters in both `nsconstruct` and `tools9p`, and [#406](https://github.com/infernode-os/infernode/pull/406) does the same for grant names.
- **Privileged control files.** [#401](https://github.com/infernode-os/infernode/pull/401) adds `grantpathallowed()`. It refuses outright to grant `/tool/ctl`, `/mnt/ui/ctl`, the message controller endpoints, wallet `ctl`/`pending`/`new`, and any per-account wallet `ctl`. It also refuses `/mnt/mail` paths that expose `compose` or `draft-reply`, which would let an agent send mail directly.
- **MCP.** The new `mcpdeny` capability removes named MCP tools from every granted server's listing ([#369](https://github.com/infernode-os/infernode/pull/369)). Tool names that are unsafe as path components are rejected ([#397](https://github.com/infernode-os/infernode/pull/397)).

## Catching these earlier

Fixing a namespace configuration after it has shipped is the costly way to find these problems. In June we merged `nsaudit` ([#246](https://github.com/infernode-os/infernode/pull/246)), a read-only linter that reads a capability set and the authority manifests for all 43 Veltro tools. It reports configurations such as sensitive reads combined with egress, unbounded spend, implicit network egress, or durable mutation of the host. It is advisory: the namespace remains the enforcement. Since [#391](https://github.com/infernode-os/infernode/pull/391), its rule, profile and path-semantics suites run in CI on every PR. Several fixes in this series came with a matching rule: MCP mounts now count as egress ([#396](https://github.com/infernode-os/infernode/pull/396)), and `exec` is modelled as networkless ([#377](https://github.com/infernode-os/infernode/pull/377)).

Each fix above shipped with a test that probes for the specific leak: `veltro_security_test.b`, `tests/host/write_capability_test.sh`, `tests/inferno/msg_capability.sh`, `publicnet_test.b`, and new adversarial `tools9p` probes ([#379](https://github.com/infernode-os/infernode/pull/379)). The restriction mechanism didn't change in any of this. All of the fixes were in the inputs to it.

## What we learned

The claim held, but in a narrower form than we would have stated it a month ago. An agent cannot reach what is not in its namespace. Every leak in this series was something that should not have been in the namespace and was put there by us: through a by-existence rule, an inherited grant, a list order, or a tool with more reach than its caller. The model was never the part that failed.

That points to the next step. Reviewing our own configuration is necessary, but it is not enough. We wrote the grants, and we wrote the code that reviews them. The stronger test is to give capable models a confined namespace and a reason to leave it, and see what they try. We have started building the tooling to do that, and the findings will be reported here.
