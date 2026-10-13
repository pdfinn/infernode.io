---
title: Run on bare metal
description: InferNode as the operating system itself, with nothing underneath — on a Raspberry Pi or under QEMU.
---

InferNode usually runs *hosted*: `emu` is a program on macOS, Linux or
Windows, and the host's kernel does the scheduling, the memory and the
devices. It can also run **native**, as the operating system itself, with
nothing underneath. The kernel boots, brings up the hardware, starts the Dis
virtual machine, and runs the same Limbo bytecode the hosted emulator runs:
the same shell, the same Tk, the same Lucia desktop.

This page is the short version. The full manual is
[docs/BAREMETAL.md](https://github.com/infernode-os/infernode/blob/master/docs/BAREMETAL.md)
in the InferNode repository.

## Where it runs today

| Board | State |
|-------|-------|
| **Raspberry Pi 3B+** (`os/bcm2837`) | Runs on the real board, and on QEMU's `raspi3b`. Ethernet, Wi-Fi, Bluetooth, SD card, HDMI/DSI, USB keyboard and mouse, touch, GPIO, audio, A/B kernel update, boot watchdog. |
| **QEMU `virt`** (`os/virt`) | GICv2 and virtio (net, blk, keyboard, tablet, ramfb) — the kernel anywhere QEMU runs, which is what CI boots. |
| **Raspberry Pi 4B** (`os/bcm2711`) | Boots to the desktop under QEMU's `raspi4b`; has never run on a board. |
| **QEMU RISC-V `virt`** (`os/riscvvirt`) | RV64GC under OpenSBI with the RISC-V Dis JIT. |
| **PolarFire SoC: BeagleV-Fire, Icicle Kit** (`os/mpfs`) | Boots under QEMU's `microchip-icicle-kit`. It has never run on a board. |

The current state of each board is kept in the
[InferNode README](https://github.com/infernode-os/infernode#bare-metal--infernode-as-the-kernel).

## How it is put together

```
appl/ → dis/            Limbo programs: sh, Tk apps, Lucia, Veltro…     (identical to hosted)
───────────────────────────────────────────────────────────────────────
os/init/                the first Limbo: osinit, USB class drivers
lib*/                   Dis VM + ARM64 JIT, Tk, draw, crypto, math
os/port  os/ip          the portable kernel and TCP/IP, from upstream Inferno
os/arm64                boot, traps, SMP, kmain — any AArch64 board
os/bcm                  what the Raspberry Pi SoCs share
os/bcm2837 │ os/bcm2711 │ os/virt
                        one board each: addresses, interrupt numbers, RNG, device list
```

The kernel image carries a small **recovery root** compiled into it —
`osinit`, the shell and its builtins, file utilities, `dossrv`, the USB and
Ethernet drivers — enough to reach the card and to give you a usable console
if the card is bad. Everything else, including the whole desktop, comes off
the card (or a file server) at boot.

## Headless, or with a desktop

The machine decides at boot by one question: **is there a screen?**

**Headless**: no HDMI or DSI panel on a Pi; no `-device ramfb` under QEMU.
The machine boots to a shell on the serial console with the full namespace,
brings up Ethernet by DHCP, mounts the card and takes its userspace from it,
so every command in `dis/` is there. A headless machine is administered over
the serial line, the network console, or whatever it is told to serve: it is
an Inferno system, so `listen`, `styxlisten` and `mount` are how it offers
and takes services.

**With a desktop**: a screen is present, so the same boot goes on to
`wm/logon` (or straight past it, with `skiplogon`) and the Lucia desktop.
The serial console is *still* a shell with the full namespace.

With **no card at all** either kind still boots, to the recovery root
compiled into the kernel: a shell, the file utilities, the network.

## Build the kernel

There is one supported way to build the kernel, and it is the test harness.
From a built InferNode source tree:

```sh
export ROOT=$PWD
export PATH=$ROOT/<SYSHOST>/<OBJTYPE>/bin:$PATH      # the native mk and limbo
for d in appl appl/mpeg appl/veltro tests; do (cd $d && mk install); done

BAREMETAL_BUILD_DIR=/tmp/bm ./tests/host/baremetal_test.sh
```

It needs `clang`, `ld.lld`, `llvm-objcopy`, `llvm-ar`, `python3`, the native
`limbo`, a built `dis/` and `qemu-system-aarch64`. **If clang, lld or QEMU is
missing the harness skips and exits 0**: a run that says nothing about the
kernel means the toolchain was not found, not that everything passed.

Set `BAREMETAL_PLATFORMS=virt` to build only the QEMU machine, which is the
quickest. The kernels land in the build directory as `virt-kernel.img`,
`bcm2837-kernel.img` and so on.

## Try it under QEMU

Make a card image, then boot it:

```sh
printf 'local\n' > /tmp/rootpath;  : > /tmp/skiplogon
tools/mkcard.py card.img 256 /dis=dis /lib=lib /fonts=fonts /icons=icons /usr= \
    /rootpath=/tmp/rootpath /skiplogon=/tmp/skiplogon

qemu-system-aarch64 -M virt -cpu cortex-a53 -smp 4 -m 1024 \
    -kernel /tmp/bm/virt-kernel.img -serial stdio \
    -device virtio-rng-device \
    -netdev user,id=n0 -device virtio-net-device,netdev=n0 \
    -drive file=card.img,if=none,format=raw,id=sd -device virtio-blk-device,drive=sd \
    -device ramfb -device virtio-keyboard-device -device virtio-tablet-device
```

A window opens on the Lucia desktop in under a minute, and the terminal you
started QEMU from is the serial console — a root shell, the whole time.
Leave `skiplogon` out for the login screen.

**Headless**: use `-nographic` in place of `-serial stdio` and drop the last
line (`Ctrl-A x` quits).

Two flags catch everyone: **`-cpu cortex-a53`** (without it `-M virt` is a
32-bit CPU and prints nothing at all) and **`-kernel …img`, not `.elf`**
(QEMU passes the device tree only to a flat image).

## Put it on a Raspberry Pi

The card is FAT32, with the partition at sector 2048 (what every imaging
tool makes). On it:

- **From Broadcom:** `bootcode.bin`, `start.elf`, `fixup.dat`.
- **`config.txt`:**

  ```
  arm_64bit=1
  enable_uart=1
  init_uart_clock=48000000
  kernel=infernode8.img
  cmdline=cmdline.txt

  [tryboot]
  kernel=tryboot.img
  cmdline=tryboot.cmd
  ```

  `tryboot.cmd` holds the single word `tryboot`.
- **The kernel** for your board, on the card as **`infernode8.img`**.
- **Userspace**, from a built tree: `dis/`, `lib/`, `fonts/`, `icons/`, and an
  empty `usr/`.
- **Radio firmware**, if you want Wi-Fi: `tools/pi-firmware.sh` fetches and
  checks it.

You need a **3.3 V USB-serial cable on GPIO 14/15** (115200 8N1). The console
is mirrored to HDMI once the framebuffer is up, but everything before that,
and every panic, is on the serial line only.

Each board has its own files and differences — the Pi 4B, for example, uses
`start4.elf`, `fixup4.dat` and its own kernel image. The
[full manual](https://github.com/infernode-os/infernode/blob/master/docs/BAREMETAL.md)
lists them, along with updating the kernel without pulling the card, the
control files on the card, and debugging a boot.
