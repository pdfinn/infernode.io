---
title: 3. Run the tour
description: Veltro demonstrates InferNode using InferNode's own tools — live, not a video.
sidebar:
  order: 3
---

Most systems introduce themselves with a screenshot. InferNode introduces itself
by having the agent drive the machine while you watch.

The tour is not a recording and not a script running in a sandbox. Veltro reads
a plain-text outline and carries it out with the same tools it would use for any
other task — launching real applications, drawing real fractals, and writing
real documents into the presentation zone.

:::note[Veltro]
**Veltro** is InferNode's agent runtime. It reads its available tools out of the
filesystem at `/tool`, and everything it can reach is determined by what was
mounted into its namespace before it started. Step 6 is about that boundary.
:::

## Start it

**In Lucia**, type this into the conversation zone:

```
run the tour
```

**Headless or in a terminal**, from the Inferno prompt:

```sh
; veltro 'run the tour'
```

Or start the REPL first and ask from there:

```sh
; repl
> run the tour
```

## What happens

Veltro works through twelve sections, pausing between each to ask whether you
want to continue, repeat, or skip ahead. It is a conversation, not a slideshow —
you can interrupt it and ask about anything it just did.

Along the way it covers:

- **The three zones** — conversation, presentation, and context
- **What 9P is, and why files** — the idea underneath everything else
- **Launching apps** — the Mandelbrot and Julia fractal viewer, driven live
- **The text editor** — collaborative editing in the presentation zone
- **Your namespace** — what the agent can see, and how you control it
- **Finding and reading files** — `find`, `read`, `search`, and `grep`
- **Persistence** — what it remembers between sessions
- **Voice** — text-to-speech and speech-to-text
- **The host OS bridge** — reaching the system underneath
- **More capabilities** — planning, subagents, web fetch and search, git, and
  a dozen others

The outline it is following is a text file at `/lib/veltro/demos/tour.txt`. You
can read it, edit it, and write your own.

## Verify

You have done this step when the agent has put something on screen that you did
not ask for specifically — a document, a running clock, a fractal — and you can
still talk to it about what it just did.

<div class="expected">

Try interrupting it mid-tour and asking:

```
what did you just run?
```

It will tell you, because the tools it used are files and it can read its own
trail through them.

</div>

## If the tour does not start

**Nothing happens in Lucia** — check that the conversation zone has focus. The
welcome document in the presentation zone is not an input field.

**`veltro: command not found` in a terminal** — you are outside the Inferno
namespace. Make sure you are at the `;` prompt inside InferNode, not at your
host shell.

**Veltro does not respond at all** — no model is connected, or you configured
one and did not relaunch. Go back to
[Connect a model](/docs/quick-start/connect-a-model/).

:::tip[Skip ahead freely]
The tour is long by design. You do not have to finish it — say `skip` or just
close it and move to step 4. You can always come back with `run the tour`.
:::

---

Next: [Everything is a file](/docs/quick-start/everything-is-a-file/) — the one
idea that makes the rest of the system obvious.
