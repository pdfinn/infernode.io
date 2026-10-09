---
title: "Nine days to a window manager on a bare Raspberry Pi"
description: "Inferno® was always meant to run natively on small devices. InferNode now runs as the operating system on a Raspberry Pi 3B+: its own kernel, IP stack, USB, JIT, and acme on the panel. What emulation could not tell us, and what is still slow."
pubDate: 2026-09-01
author: "P. D. Finn"
tags: ["baremetal", "arm64", "kernel", "raspberry-pi"]
---

Inferno® was built to be an embedded operating system. It runs two ways: *hosted*, as a program on another operating system, or *native*, as the operating system itself on small devices. The upstream tree carried kernels for the Compaq iPAQ, Gumstix and Cerf boards, a JavaStation, and a family of ARM and PowerPC evaluation boards, each booting straight into Dis with no other system underneath. Those ports were 32-bit, and the boards they targeted are long gone.

Everything InferNode has shipped so far is hosted. `emu` runs on macOS, Linux or Windows, and the host provides memory, threads, files and the network. That was the right place to start: 64-bit Dis, the JITs and the modern cryptography all had to exist before anything else could. But it left Inferno® as an application, not an operating system. Running natively on a modern 64-bit Raspberry Pi brings the design full circle. It is the kind of small embedded-class board Inferno® was always meant for, and on it Inferno® is a full operating system again, with its own kernel, drivers, network stack and window system. It is also one of the clearest tests of the bet behind this fork: that a small team working closely with AI coding assistants can close a gap of more than ten years without losing the design.

We started on 2026-08-23, with InferNode as the firmware on a Raspberry Pi 3B+ and nothing underneath it. On 2026-08-31 we tagged [`baremetal-gui-working`](https://github.com/infernode-os/infernode/tree/baremetal-gui-working/os/bcm2837): acme and the clock launch, draw and exit cleanly on the board, the mouse works in wm and inside acme, and the cursor renders. The tag message says these were "verified on the board by the user, not inferred". That distinction mattered all week. The full engineering record is in [os/bcm2837/README.md](https://github.com/infernode-os/infernode/blob/baremetal-gui-working/os/bcm2837/README.md).

## Why `os/`, and why this board

`emu/port` plus `emu/<Platform>` *is* the layer that maps Inferno onto POSIX or Win32. A bare-metal port doesn't add a platform to that layer. It replaces the layer. So the kernel lives under `os/`, as upstream's native ports did, and links the host-independent parts of the tree: `libinterp` (including the existing AArch64 JIT), `libsec` and `libmath`.

We chose the Pi 3B+ because InferNode is 64-bit only, and this board has the best bare-metal documentation of the 64-bit Pis, plus a GPIO UART and wired Ethernet. The work is split into `os/arm64`, which any AArch64 board shares (boot stub, vectors, traps, `kmain`), and `os/bcm2837`, which holds only what is specific to this SoC.

## The day-two kernel

On day two we brought the portable kernel up layer by layer, from `xalloc` to `/dev/cons`, with a QEMU check behind each layer. By the end of the day Dis bytecode was executing ([b0b9579e](https://github.com/infernode-os/infernode/commit/b0b9579e)), an interactive shell answered over serial ([bba739a5](https://github.com/infernode-os/infernode/commit/bba739a5)), and the JIT ran ([ba9f31cf](https://github.com/infernode-os/infernode/commit/ba9f31cf)). The JIT's only host dependencies had been `mmap(PROT_EXEC)` and an icache flush.

Four bugs stood between the first `print` and a stable VM, and none showed up where it happened. One was the pool quantum: upstream's value of `31` is right for ILP32, but under LP64 the splitter could carve out a block too small to hold its own header, and `pooladd()` wrote 24 bytes past it. Another was FP/SIMD state, which was not saved across context switches. The kernel is built `-mgeneral-regs-only`, but `libinterp` is not, and clang puts ordinary pointers in `d8`-`d15`.

A separate instability was worse: about half of all boots failed. `hzclock()` calls `sched()` from the clock interrupt, `sched()` re-enables interrupts while still inside the handler, and the next tick nested again. The kernel stack grew until it ran through the heap into libkern's format-handler table, and the next `print()` branched through a slot holding a formatted character. A guard word at the base of each kernel stack caught it. Raising `KSTACK` to 64K did not help, which is what showed the cause was recursion rather than depth. After the fix the kernel booted 28 of 28 times.

## The JIT, measured properly

The first measurement was one arithmetic loop: 80 ms JIT against 2160 ms interpreted, **27x**, on the same kernel built with and without the JIT. In the hosted emulator on an M-series Mac the same code generator gives about 10x. The in-order Cortex-A53 cannot hide the interpreter's two indirect calls per instruction the way an out-of-order core can.

A six-opcode loop measures little, so [a5ec654e](https://github.com/infernode-os/infernode/commit/a5ec654e) reworked the benchmark along the lines of Vita Nuova's *Reliable Benchmarking with Limbo on Inferno*, using microsecond timing and the minimum of repeated samples. Seven opcode classes each fold into a checksum, and the JIT and interpreter checksums must agree, because a JIT that is fast but wrong is a miscompilation. Under emulation the speedup was 29x on integer and 64-bit arithmetic, 14x on arrays, 8x on floating point, but 1.8x on strings and 2.1x on channels, the classes that spend their time in runtime C.

## The board disagrees with the emulator

The first real boot ran everything above the drivers on the first attempt: EL2 to EL1, MMU, timers, interrupts, the VM, the JIT, loopback TCP and a shell. Every fault after that was one QEMU could not have shown us ([215cf771](https://github.com/infernode-os/infernode/commit/215cf771)):

- **A bus address is not a physical address.** The USB controller is a bus master on the VideoCore side, so DMA needs `BUSADDR`, not `PADDR`. QEMU doesn't model the alias.
- **An unbounded wait is a machine-killer.** On the board, a transfer that never completed took the whole machine down, with no console left to ask what had happened. Bounding the wait produced the diagnostic that found the bus-address bug.
- **The emulator is lenient where hardware isn't:** exclusives with the MMU off, cache maintenance, the SD card's 4-bit bus.

## Mechanism in the kernel, protocol outside

The 3B+'s NIC is a LAN7515 behind USB. The DWC OTG host stack (`usbdwc.c`, `devusb.c`) came from Plan 9 4e, which is MIT-licensed. We did not import `etherusb.c`. The rule we wrote down is that the kernel provides access to the *bus*: registers, DMA, interrupts and raw endpoints as `#u`. Anything that speaks one device's protocol is a program. So the LAN78xx and RNDIS drivers are Limbo, and serve `/net/ether0`. `ethermedium` dials it by name and cannot tell whether a C driver or a 9P server answered. The SD card follows the same rule: the kernel moves blocks, and the partition table and FAT are handled outside it.

The cost is that every packet crosses the boundary through the VM. The README says to measure that rather than guess, and the measurements were not flattering. A 16-frame receive queue dropped about ten per cent of a 256 KB inbound transfer: inbound ran at 7.9 KB/s while outbound ran at 75 KB/s ([19165e9e](https://github.com/infernode-os/infernode/commit/19165e9e)). That is fixed. At the tag, networking is correct but runs at about 0.3% of what the hardware can do. That is the largest open item.

## Pixels

`/dev/draw` landed on 2026-08-27 ([14a72219](https://github.com/infernode-os/infernode/commit/14a72219)), followed the same day by `$Draw`, `$Tk`, `devsrv`, `exportfs`, `$Math` and wm. Text initially drew nothing: the kernel had never called `memimageinit()`, so `memopaque` was nil. Client draws carry their own mask, but copying a glyph into a font cache does not, and a draw with a nil mask does nothing ([f748c409](https://github.com/infernode-os/infernode/commit/f748c409)). A keystroke's echo had taken 1780 ms because the framebuffer was mapped as Device memory. It is now Normal non-cacheable.

The last bug before the tag was a race between drawing and the software cursor, which shares the scanout memory and saves the pixels under it. Anything drawn under the cursor made those saved pixels stale, and the next mouse move painted old content over new. The fix, [7a34353a](https://github.com/infernode-os/infernode/commit/7a34353a), restores saved pixels only where the draw did not touch.

## What we learned

The pace came from the way we work. Most of the kernel already existed, in Plan 9 4e and in our own `emu/port`, and porting it is the kind of large, careful, mechanical job that AI assistants speed up a great deal. The README is just as clear about the cost of going fast. Stale build state produced confidently wrong results three separate times. In one, an ELF left on disk from a different build made every faulting address resolve to an unrelated function. In another, a self-test reported a hardware fault that did not exist. The lesson is the one it states: verify the toolchain before trusting what it tells you about the bug. The emulator, the tests and the assistants all gave plausible answers. The board decided which ones were right.

## Still open

From the tag message: `wm/colors` leaves a black ghost on exit, a right-click on the wm desktop launches windows from the menu in rapid succession, and the network is slow. The kernel is built and tested only through `tests/host/baremetal_test.sh`, which boots it under QEMU and asserts on the result, down to pixel values read back over QMP. Next is network throughput, and then the parts of the board we have not touched.

None of that changes what the tag means. For the first time in this fork, Inferno® is not a guest. It owns the board from the first instruction: it takes the interrupts, schedules the processes, drives the USB bus, speaks TCP/IP and draws the window manager, with the same Dis, the same JIT and the same namespaces that run hosted on a laptop. That is what Inferno® was designed to be. It is an operating system again, for small boards rather than desktops, but an operating system nonetheless.
