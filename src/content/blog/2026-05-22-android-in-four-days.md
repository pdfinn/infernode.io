---
title: "From Termux to an APK: InferNode on Android in four days"
description: "We went from building o.emu inside Termux to an APK that boots the full GUI on a Galaxy A55. The JVM, Bionic and the app sandbox each broke a different assumption."
pubDate: 2026-05-22
author: "P. D. Finn"
tags: ["android", "arm64", "emu", "porting"]
---

The device people trust an agent with most is the one in their pocket. It holds their messages, contacts, location and keys, and the sandboxes it ships with were designed for apps, not for software that decides on its own what to open next. If namespaces are the right way to contain an agent, a phone is where that claim matters most. So in May the goal became the one [docs/HELLAPHONE.md](https://github.com/infernode-os/infernode/blob/master/docs/HELLAPHONE.md) states: run the Dis VM, the ARM64 JIT, 9P and the Veltro agent harness on a stock phone.

It was also a test of the other experiment running through this project. Our emulator tree had never been built against Bionic, run under a JVM or confined by an Android app sandbox. We wanted to see how fast a small team working with an AI assistant could get across that gap, if each step was kept small enough to verify on real hardware.

Between 18 and 21 May, InferNode went from "does `o.emu` compile on a phone at all?" to an APK that boots the full GUI (`sh -l /lib/lucifer/boot.sh`) on a Samsung Galaxy A55 running Android 16. The target lives in [`emu/Android/`](https://github.com/infernode-os/infernode/blob/master/emu/Android/README.md), next to `emu/Linux/` and `emu/MacOSX/`. *Hellaphone* is the internal name for a phone-shaped InferNode.

We went in phases so that each step on the device had one question to answer and one thing that could fail. Most of what follows is what failed.

## Phase 0: Termux, and what Bionic leaves out

ARM64 Android running Termux is close enough to ARM64 Linux that we could reuse `emu/Linux/` unchanged (`SYSHOST=Linux`, `OBJTYPE=arm64`) and build on the handset itself ([#93](https://github.com/infernode-os/infernode/pull/93)). Close enough isn't the same, though. Bionic, Android's C library, differs from glibc in places Inferno®'s Linux port had always taken for granted:

- `<sys/types.h>` doesn't expose `ushort` and `uint`.
- `<stdio.h>` declares `rewind` unconditionally, which collides with the Limbo compiler's own symbol.
- There is no `getdtablesize()`, so we use `sysconf(_SC_OPEN_MAX)`.
- `malloc_usable_size` takes a `const void *`.
- `__libc_free` doesn't exist. Inferno's allocator uses it on glibc to free memory that `dlopen`'d libraries allocated through libc ([3605cc4](https://github.com/infernode-os/infernode/commit/3605cc4f7a9dcfbdbb4c6af7e570352de224a6b5)).
- `pthread_attr_setinheritsched` isn't implemented. Leaving the call out is semantically identical, since new threads inherit scheduling by default ([2016431](https://github.com/infernode-os/infernode/commit/2016431dd5bfee3dc5a5c7189a856b4a7377321e)).
- `getrandom()` is in libc but its prototype is hidden below API 28 ([1a1a2e1](https://github.com/infernode-os/infernode/commit/1a1a2e164751b5a2f2a82b1bbbe949f73455e228)).

The `getrandom` gap is a good argument for CI. The handset build never hit it, because the device targeted a high enough API level. The `termux-docker` runner in our new Termux regression gate ([#97](https://github.com/infernode-os/infernode/pull/97)) defaults to a lower `minSdk`, and it failed there.

The same runner found a bug in `mk`. `utils/mk/Posix.c` compiles in `/bin/sh` as the shell path, and pure Termux has no `/bin/sh`. The first backquote in `mkconfig` then fails, `SYSHOST` and `OBJTYPE` come out empty, and every include after that resolves to a path that doesn't exist. `mk` now takes an opt-in `MKSHELL` environment variable ([c316313](https://github.com/infernode-os/infernode/commit/c3163137c7103811b3301a7a36f07af6cc69184a)). We gave it its own name and didn't read `SHELL`, so that users whose login shell is bash don't silently get bash semantics in recipes written for POSIX sh.

## Phase 1: the NDK, and the JVM

Phase 1a moves the build off the phone. A Linux host cross-compiles `o.emu` with the NDK r29 toolchain against Bionic, and the result runs via `adb shell` with no Termux involved. The binary is 4.15 MB, ELF aarch64, API 28+ ([04ce1c5](https://github.com/infernode-os/infernode/commit/04ce1c5d3239e886baaa95e4785ba32adc6405a2)). Phase 1b replaced the stub audio backend with AAudio ([f06bf7d](https://github.com/infernode-os/infernode/commit/f06bf7d7a629e4f4bab1a38baa26c28ffb73a9b3)).

An APK needs an entry point Java can call, so `main()` became a three-line shim around a new `emu_run(argc, argv)` ([260371d](https://github.com/infernode-os/infernode/commit/260371d5e3722801b8a97d9a6a0abba3b306f899)). CI now assembles a debug APK on every PR ([#107](https://github.com/infernode-os/infernode/pull/107)). The APK installed and launched fine, and then about 22 ms after `libemu.so` loaded, the zygote SIGKILLed the process. There was no crash report.

Phase 1d ([#108](https://github.com/infernode-os/infernode/pull/108), [17355df](https://github.com/infernode-os/infernode/commit/17355dfba29e95b62e391a03c7bab8fec44d30e1)) found three bugs stacked on top of each other. Each one only became visible once the one in front of it was fixed:

1. **`pthread_exit` on a JVM thread.** In headless mode, emu's boot ends in `for(;;) ospause();`, and `ospause()` calls `pthread_exit`. We had called `emu_run` on the JNI thread, which the JVM owns, so the JVM's thread vanished under it. The fix runs emu on a detached pthread the JVM knows nothing about.
2. **Signal handlers.** Emu installs handlers for `SIGSEGV`, `SIGBUS`, `SIGILL` and `SIGFPE`. The JVM relies on `SIGSEGV` internally, for null checks and GC barriers. The first one it raised went to emu's `trapmemref` and panicked. Emu has had an escape hatch for this for decades, the `-s` flag, which skips installing trap handlers, and the Activity now always passes it.
3. **`kill(0, SIGKILL)`.** With no input, the shell got EOF on fd 0 (which is `/dev/null` under JNI) and exited, and `cleanexit()` ran. On a desktop that function kills the process group. On Android, the process group is the entire app, JVM included. On Android, `cleanexit()` now just ends its own thread.

After those fixes, logcat showed the Inferno prompt and the process stayed asleep instead of dying. Phase 2a connected a pipe to fd 0 and fed fd 1 and fd 2 back into the Activity through a JNI callback, which gave us an interactive Inferno shell inside the APK ([#109](https://github.com/infernode-os/infernode/pull/109)).

## Phase 2b: SDL3 and the GUI

For the GUI we cross-built SDL3 3.2.16 for Android and added a `GUIBACK=sdl3` variant of `libemu.so`, using the same `mkfile-gui-$GUIBACK` pattern as the Linux build ([#110](https://github.com/infernode-os/infernode/pull/110)). On top of that sits an `SDLActivity` subclass whose `SDL_main` is simply `emu_run`. SDL calls it on its own thread, which isn't attached to the JVM, so the Phase 1d reasoning about `pthread_exit` still holds ([#111](https://github.com/infernode-os/infernode/pull/111)).

The first attempt launched `/dis/wm/wm.dis` directly and failed with `'/mnt' file does not exist`. The window manager expects the namespace that the shell profile builds. The fix was to stop inventing a mobile-specific entry point and use the developer launch line exactly as on macOS and Linux: `-c1`, 1024 MB pools and `sh -l /lib/lucifer/boot.sh` ([9b51d75](https://github.com/infernode-os/infernode/commit/9b51d75cdf77ca871b9a6f765a65f121bb43af7f)). With that, the tool server loaded its 13 active tools and the GUI initialised on the A55.

## The sandbox, measured

Boot still took around 2.4 seconds, and logcat was full of `SIGSYS`. Android's app sandbox installs a seccomp-bpf filter, and `setgid` (syscall 144 on arm64) is on its blocklist. Emu called `setgid` in the child of every `os sh -c` the profile ran. Each child died, `$ghome` and `$infhome` stayed empty, and the overlay binds walked into paths that didn't exist. An Android app is already pinned to its package uid before any of our code runs, so a privilege drop there is neither possible nor needed. After gating `setgid`/`setuid` on Bionic, we measured 1.26 to 1.37 s from launch to the first paint of the login screen on the A55 ([6639d7f](https://github.com/infernode-os/infernode/commit/6639d7f75ddff85d58e137f6c555ac5489fe8675), [#114](https://github.com/infernode-os/infernode/pull/114)). `tools/check-android-syscalls.sh` now fails CI if a blocklisted syscall appears unguarded in `emu/Android/`.

The same change:

- turns on SDL's touch-to-mouse synthesis, so a tap acts as a click
- keeps the surface inside the system-bar insets that Android 15's edge-to-edge default would otherwise draw over
- adds `lib/lucifer/boot-mobile.sh`, a wrapper that does the mobile-only setup and then hands off to the unchanged desktop `boot.sh`

## Two bugs that looked like design problems

Both of the last two looked like layout or design problems, and both were plumbing ([#118](https://github.com/infernode-os/infernode/pull/118)).

**Every tap landed in the bottom-right corner.** `draw-sdl3.c` scaled event coordinates by `SDL_GetWindowDisplayScale`, which is display *density* (2.8125 on the A55's 388 dpi panel), not the ratio of pixels to logical units. The ratio is 1.0 on Android, 1.5 on Linux at 150% and 2.0 on a Retina Mac. Computing that ratio instead fixed the bug on every platform at once ([5a4f198](https://github.com/infernode-os/infernode/commit/5a4f19824daaa3e70ff6778b14d702ecf9240e81)).

**The font binds did nothing.** The APK build copied `dis/`, `lib/` and `module/` into the asset tree, but not the 21 MB `fonts/` directory. Every `Font.open` therefore fell back to libdraw's built-in default, and we had been looking at that default font all along without noticing ([1892949](https://github.com/infernode-os/infernode/commit/18929490705f9c000518c7f851a3e3a4c189dc14)). Staging the fonts takes the APK's assets from 15 MB to 36 MB. Body text now uses 48-point subfonts, about 3.6 mm tall on that screen.

On a phone the three zones of the desktop GUI become an accordion: one expanded zone, with the other two collapsed to title bars. It is marked as a kludge in the source, to be deleted in one piece when the zones get a proper split.

## What four days taught us

The speed was real, and so was its shape. Every step was a small PR with one claim and a check on the A55, and the commit messages record logcat lines rather than hopes. Most of the time went into failures that each hid the next one: a thread the JVM owned, signal handlers it relied on, a process group that was the whole app. An assistant is good at proposing the next hypothesis quickly. The phone decided which hypothesis was right. Some of the habits we had to keep re-teaching ourselves, and the assistant, are written into the commits. The mobile accordion commit, for example, repeats the warning that `mk install` puts `lucifer.dis` where the runtime loads it, while a hand copy into `dis/cmd/` does not.

The bigger lesson is about the design. Almost nothing above the emulator changed. The phone boots the same `boot.sh` as the desktop, the same profile builds the same namespace, and the same tool server comes up. The platform glue was hard. The model on top of it carried over.

## Where it is heading

Still to do: refresh reliability, the presentation zone at phone sizes, and checking audio from the microphone end to end. The AAudio device is bound at boot, and the app now asks for `RECORD_AUDIO` ([#117](https://github.com/infernode-os/infernode/pull/117)), but we haven't yet verified the full path. The design notes in `emu/Android/README.md` plan for `/n/llm` to be served by a model running on the device, with the same 9P surface, so that agents and tools see no difference.

The same week, something else landed that matters more in the long run than any port. [#120](https://github.com/infernode-os/infernode/pull/120) added a headless agent gateway that lets an external evaluator drive Veltro over 9P on localhost, with logging of every subagent's trajectory. Its files are ring-fenced: CI fails any release that would ship them. It is the first in-tree hook for testing the namespace model the way it should be tested, by something actively trying to get out.
