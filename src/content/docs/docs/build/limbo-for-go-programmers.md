---
title: Limbo for Go programmers
description: The mapping, and the four gotchas that actually bite.
sidebar:
  order: 3
---

Limbo and Go share an ancestor — Rob Pike and Ken Thompson worked on both — so
if you write Go, the concurrency model will feel like home. What differs is
mostly modules.

## The mapping

| Go | Limbo | Notes |
|---|---|---|
| `go f(x)` | `spawn f(x)` | Preemptively scheduled Dis threads |
| `ch := make(chan int)` | `ch := chan of int` | Unbuffered by default |
| `make(chan int, 8)` | `ch := chan[8] of int` | Buffered |
| `ch <- v` / `v := <-ch` | `ch <-= v` / `v := <-ch` | |
| `select { case … }` | `alt { v := <-ch => … }` | `alt` predates `select` |
| package | module: `.m` interface + `.b` implementation | Like a header, but typed and checked |
| `import "x"` | `include "x.m";` then `x = load X X->PATH;` | Explicit, at runtime |
| `struct` | `adt` | Can carry methods |
| `interface` + type switch | `pick` (tagged union) | Closed set of variants, not structural |
| `x := 5` | `x := 5` | Same type-inferring declaration |
| `func f() (int, error)` | `f(): (int, string)` | Error is conventionally a string; `nil` means ok |
| `panic` / `recover` | `raise "fail:…"` / `exception` blocks | Exception strings matched by pattern |
| slices | `array of byte`, sliced `a[1:5]` | Also `list of T` with `hd`/`tl`/`::` |
| `range` | `for(l := lst; l != nil; l = tl l)` | No range statement |
| `int64` | `big` | `int` is 32-bit |
| `rune` | `int` | Strings index to code points as `int` |

## Modules are the load-bearing difference

A Limbo program is a set of modules linked **at runtime** with `load`, each
declaring a `PATH` constant naming its compiled `.dis` file:

```limbo
include "sys.m";
    sys: Sys;

init(nil: ref Draw->Context, args: list of string)
{
    sys = load Sys Sys->PATH;
    sys->print("hello\n");
}
```

`load` returning `nil` is a real and common failure — check it.

That explicitness is not ceremony. Loading a module is a filesystem operation,
so **module access is a capability like any other file** — which is what lets a
namespace decide which implementation of an interface a process gets. It is the
same mechanism as everything else in
[Namespaces](/docs/concepts/namespaces/).

## Concurrency

```limbo
worker(results: chan of string)
{
    results <-= "done";
}

init(…)
{
    results := chan of string;
    spawn worker(results);
    alt {
    r := <-results =>
        sys->print("%s\n", r);
    <-timeout =>
        sys->print("timed out\n");
    }
}
```

## The gotchas that actually bite

**`>>` is a logical shift.** In Go you sign-extend with `(x << n) >> n`. In Limbo
`>>` does not sign-extend, so that idiom silently produces the wrong value.
Sign-extend explicitly — `if(x > 128) x -= 256;` for a byte. This has caused
real bugs in this tree.

**No `defer`.** Clean up at exit points, or structure with a single return path.
`{ … } exception e { … }` exists for the error path.

**`int` is 32 bits.** Use `big` for 64-bit values, and mind the conversions —
they are explicit (`big x`, `int b`).

**`spawn` is cheap, not free.** Dis threads cost more to create than goroutines,
though channel operations are comparably fast. Spawn for structure, not per
datum.

**Errors are strings by convention.** `nil` means success; fallible functions
return `(result, string)` or raise `"fail:reason"`. `%r` prints the last system
error:

```limbo
sys->fprint(sys->fildes(2), "open failed: %r\n");
```

:::danger[Compile to the right target]
Use the native `limbo` compiler on the host, never the hosted `dis/limbo.dis`,
and never invoke `limbo -o` by hand. The module's `PATH` constant decides where
the runtime loads from, and a `.dis` compiled to any other path is **silently
ignored** — your edits appear to do nothing.

`tools/compile-limbo.sh <file.b>` reads the constant and emits to the right
place; `mk install` in the source directory does the same.

When a `.m` interface changes, every `.dis` built against the old one is stale
and fails at load time with `link typecheck` errors. Rebuild the dependents —
the post-merge git hook does this after pulls.
:::

## The shell is rc, not POSIX

Inferno's `sh` is rc-style. `&&`, `||`, and POSIX loops are not available and
are flagged in review. The full notes are in
[LIMBO-FOR-GO-PROGRAMMERS.md](https://github.com/infernode-os/infernode/blob/main/docs/LIMBO-FOR-GO-PROGRAMMERS.md#the-shell).

---

With that, [writing a 9P service](/docs/build/9p-service/) should read like
ordinary code.
