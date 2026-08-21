---
title: The worldview
description: Four statements, each meant literally. Everything else in InferNode follows from them.
sidebar:
  order: 1
---

InferNode inherits a design tradition — Plan 9's — that is coherent, minimal,
and different from what most people arrive knowing. Solutions that are idiomatic
elsewhere (a REST endpoint, a JSON config, a policy middleware, a client SDK)
are foreign here, and they do not compose: they bypass the namespace, break the
tool ecosystem, and turn one security chokepoint into two.

This section is the reasoning. If you are evaluating InferNode, it is the part
that tells you whether the security claims are architecture or marketing. If you
intend to build on it, it is what stops your first design from needing a rewrite.

Four statements, each meant literally.

## Everything is a file

Not "many things have file-like wrappers" — everything.

| Resource | Path |
|---|---|
| Networking | `/net/tcp/0/data` |
| Processes | `/prog/123/ctl` |
| The screen | `/dev/draw` |
| A language model | `/mnt/llm` |
| Payments | `/n/wallet` |
| The audit trail | `/mnt/audit/log` |

Unix had this as a good idea applied inconsistently. Plan 9 took it seriously,
and InferNode inherits that seriousness. When you add a capability to this
system, you add it as files.

## The filesystem is the API

A new service is a 9P file server. Not a library, not an RPC endpoint, not a
daemon with a bespoke socket protocol. Any program in any language — and any AI
agent — uses it with `open`, `read`, `write`. No SDKs, no protocol buffers, no
generated clients.

:::note[The comparison worth making]
This is conceptually what MCP does for AI tools, except the protocol is forty
years older and simpler, and every tool that already exists speaks it. An agent
does not need an integration written for each capability; it needs a namespace.
:::

## The namespace is the schema

The directory hierarchy carries the structure that other systems put into JSON
objects, schemas, and API documentation.

```
/n/sensors/station-1/temperature
```

containing `22.5` needs no parser and no specification. Design the tree and you
have designed the interface — which is why, in this system, a twenty-line
namespace sketch *is* the design document.

## Text is universal

Data crossing a 9P interface is plain text: one value per file, one record per
line, fields space-separated, RFC 3339 timestamps. Every shell tool, every
pipeline, and every language model consumes that natively without being taught.

JSON is legitimate exactly at external boundaries — an HTTP API you call, a
model wire format you speak — and is kept out of the namespace itself. When an
adapter must speak JSON outward, the 9P surface is designed as though the
adapter will one day be removed, because it will.

## Where to go next

- **[Namespaces](/docs/concepts/namespaces/)** — the deep idea, and the one the
  security model falls out of
- **[Contain and restore](/docs/concepts/contain-and-restore/)** — the four
  layers that bound and reverse a failing agent
- **[Design the interface first](/docs/concepts/design-first/)** — how to build
  something that fits, including the paradigms to catch in review

The full internal document behind this section is
[DESIGN-PRINCIPLES.md](https://github.com/infernode-os/infernode/blob/main/docs/DESIGN-PRINCIPLES.md).
