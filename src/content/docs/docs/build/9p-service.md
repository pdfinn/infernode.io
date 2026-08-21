---
title: Writing a 9P service
description: countfs, in seven steps — design, skeleton, build, run, test, document, grow.
sidebar:
  order: 2
---

## Step 1 — Design the file interface first

Before any code, write the namespace sketch: the tree, each file's read and
write behaviour, and a sample session.

```
/mnt/count/
    ctl        # write-only: 'add n' | 'set n' | 'reset'
    value      # read-only: current count, decimal, one line
    log        # read-only: one line per change:
               #   <rfc3339-utc> <verb> <old> <new>

; echo add 5 > /mnt/count/ctl
; cat /mnt/count/value
5
; cat /mnt/count/log
2026-08-21T14:32:00Z add 0 5
```

Three things are already decided, with no code written:

- **The API.** Any program, shell, or agent that can open, read and write files
  can use this. There is nothing else to learn.
- **The access policy.** `ctl` write-only, `value` and `log` read-only. That is
  the entire security model, carried by file modes rather than by checks in
  code.
- **The data format.** Text — one value per file, one record per line, fields
  space-separated, RFC 3339 timestamps.

Two more sketch-time decisions:

**Placement.** `/mnt/count`, not `/n/count`: this program authors its schema,
and trees we synthesize live under `/mnt`. `/n` is the import yard for foreign
trees mounted intact.

**Mechanism.** `countfs` has a directory, per-file behaviours and error replies,
so it uses the `styxservers` library with a `nametree`. One or two flat files
with no tree would only need `sys->file2chan`.

For a real service this sketch goes in a proposal issue before implementation.

## Step 2 — The skeleton

**Qid paths are small constants.** Each file gets one, and they become the case
labels of the serve loop:

```limbo
Qdir, Qctl, Qvalue, Qlog: con iota;
```

**The tree is the sketch, verbatim.** Four lines, and the modes are the access
policy from step 1:

```limbo
(tree, treeop) := nametree->start();
tree.create(big Qdir, dir(".", Sys->DMDIR|8r555, Qdir));
tree.create(big Qdir, dir("ctl", 8r222, Qctl));
tree.create(big Qdir, dir("value", 8r444, Qvalue));
tree.create(big Qdir, dir("log", 8r444, Qlog));
```

**The server reads Tmsgs from a channel and replies.** `countfs` serves on file
descriptor 0, which is what the `mount {countfs}` idiom expects:

```limbo
(tc, srv) = Styxserver.new(sys->fildes(0), Navigator.new(treeop), big Qdir);
```

The serve loop handles only what this service cares about — reads of its two
data files, writes to `ctl` — and hands everything else to the library.

## Step 3 — Build it

```sh
export ROOT=$PWD
export PATH=$PWD/MacOSX/arm64/bin:$PATH    # or Linux/<arch>/bin

tools/compile-limbo.sh appl/cmd/countfs.b
```

:::danger[Never run `limbo -o` by hand]
`compile-limbo.sh` reads the module's `PATH` constant (`/dis/countfs.dis`) and
emits to exactly that location. Compiling to the wrong target while emu loads
the old bytecode is this repository's most notorious time sink — the symptom is
edits that appear to do nothing.
:::

Alternatively `cd appl/cmd; mk install` after adding `countfs.dis` to the
mkfile's `TARG` list, which is also what makes CI build it.

## Step 4 — Try it interactively

```sh
./emu/MacOSX/o.emu -c1 -r$PWD sh -l
```

```
; mkdir -p /tmp/count
; mount {countfs} /tmp/count
; echo add 5 > /tmp/count/ctl
; echo add 2 > /tmp/count/ctl
; cat /tmp/count/value
7
; cat /tmp/count/log
2026-08-21T14:32:00Z add 0 5
2026-08-21T14:32:04Z add 5 7
; echo bogus > /tmp/count/ctl
echo: write error: unknown control request
```

On a booted system with `mntgen` serving `/mnt`, you would mount at `/mnt/count`
directly.

Note the last line. The bad verb failed **at the writer**, carrying the server's
error text — which is the whole point of writes being RPCs.

:::caution[The caller's half of that contract]
When you are the *caller* of a 9P interface, a write is an RPC and its error
reply is the server talking to you. A caller that logs the error and carries on
has not handled it — and if it already consumed the data it meant to write, it
has silently lost it. Servers get hardened over time, so a write that passed
last month may be rejected today. Check the reply, surface the failure, and
never discard the payload on error.
:::

## Step 5 — The contract test

The namespace sketch is a contract, and contracts get tests. The right tier for
"service X serves files Y with behaviour Z" is an Inferno-side shell test — the
cheapest harness that can observe it.

`tests/inferno/countfs.sh` asserts everything step 1 promised: the tree's
contents, initial state, each verb's arithmetic, the log's line count and field
layout, rejection of unknown verbs, and — importantly — that the *modes* hold.
Reading `ctl` fails; writing `value` fails. The security model is in the
interface, so the test verifies it from the outside.

Two Inferno-`sh` rules the test demonstrates, both learned the hard way:

- **Scripts must be committed executable** (mode 100755). `sh->system()` execs
  the path, and a 644 script fails as *file does not exist*. CI enforces this.
- **A failed `sh` redirection raises, even inside `if {...}`.** To assert
  "writing this file fails", make the *command* attempt the open
  (`cp /dev/null $f`), not a redirection (`echo x > $f`) — the latter aborts the
  whole script instead of failing the condition.

```sh
./emu/MacOSX/o.emu -r. /dis/sh.dis /tests/inferno/countfs.sh
```

Then Ctrl-C: emu stays alive while the mounted server runs, which is expected
for any backgrounded 9P service.

## Step 6 — The man page

A service ships with a man page specifying every file's read and write
semantics. **The man page is the interface spec.** `man/4/countfs` follows the
house pattern; `man/4/mail9p` is the fuller model for a real service. Add the
entry to `man/4/INDEX`.

## Step 7 — What a real service adds

`countfs` stops where the tutorial stops. Growing it into production is more of
the same conventions, not different ones.

**Per-session state** → the `clone` pattern: reading `clone` allocates a session
directory. `appl/cmd/gpusrv.b` has the best header comment in the tree on this;
`appl/cmd/webfs.b` is the other model.

**Blocking reads and events** → hold the `Tmsg.Read` and reply when data
arrives; cancel on `Flush`. `appl/cmd/chatsrv.b` shows the pending-request idiom
in about thirty lines.

:::note[The fid is the session]
The moment you hold per-client state — a parked read, a busy flag, a helper fd —
key it to the fid and tear it down in `Clunk`, which 9P guarantees you receive
even when the client dies. A global "busy" flag any client can wedge is the
anti-pattern; exclusivity is `DMEXCL`.
:::

**Irreversible actions** → emit an audit record. One write to `/mnt/audit/log`,
a silent no-op if the mount is absent.

**Agent access** → decide which files are grantable and which are control-plane.
Effectful operations get the proposal/commit split.

**Serving across the network** → nothing in the code changes:

```sh
; styxlisten -k <keyfile> tcp!*!PORT export /mnt/count   # one host
; mount -k <keyfile> tcp!host!PORT /mnt/count            # the other
```

Location transparency is the model working, not a feature you add.

---

When your design is sketched, open the proposal issue. The full internal version
of this walkthrough is
[TUTORIAL-9P-SERVICE.md](https://github.com/infernode-os/infernode/blob/main/docs/TUTORIAL-9P-SERVICE.md).
