---
title: Run on bare metal
description: InferNode as the operating system itself, with nothing underneath — on ARM64 and RISC-V, or under QEMU.
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
| **Raspberry Pi 4B** (`os/bcm2711`) | Runs on the real board and on QEMU's `raspi4b`: SD card, gigabit Ethernet, Wi-Fi and Bluetooth, USB, the 7" panel and touch, the camera (a Camera Module 3, served by `camsrv`), the headphone jack, all four cores. |
| **Raspberry Pi 5** (`os/bcm2712`) | Runs on the real board (8GB, rev 1.0); no emulator models a Pi 5. All four cores, gigabit Ethernet, USB, Wi-Fi, Bluetooth, GPIO, I2C, SPI, PWM, the real-time clock, the fan, an NVMe drive, and the desktop on either HDMI port. Not yet: two screens at once, DSI and CSI. The D0 stepping (2GB boards and later) has not been run. |
| **QEMU `virt`** (`os/virt`) | GICv2 or GICv3, and virtio (net, blk, keyboard, tablet, ramfb) — the kernel anywhere QEMU runs, which is what CI boots. |
| **QEMU RISC-V `virt`** (`os/riscvvirt`) | RV64GC under OpenSBI with the RISC-V Dis JIT. |
| **PolarFire SoC: BeagleV-Fire, Icicle Kit** (`os/mpfs`) | Boots under QEMU's `microchip-icicle-kit`. It has never run on a board. |

CI builds, boots and tests QEMU `virt`, the Pi 3B+ and 4B models and both
RISC-V machines on every change to the kernel; it builds the Pi 5 kernel but
cannot boot it. The current state of each board is kept in the
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

## One Dis VM per core

On a multi-core board the native kernel runs **one Dis virtual machine per
core**, each with its own interpreter, scheduler, heap, collector and module
table. Programs in different VMs share only the kernel — files, pipes, 9P and
served names — so within a VM nothing changes, and talking across VMs costs no
more than talking within one. VM 0 is where everything runs unless it is
placed elsewhere, and the only one with the window system.

```sh
; vm                                  # how many VMs, and each one's processes and heap
; for i in 0 1 2 3 { vm $i myjob $i } # four compute-bound jobs, one a core
```

`#X` (`/dev/vm`, [`vm(3)`](https://github.com/infernode-os/infernode/blob/master/man/3/vm))
has a `ctl` and each VM's `run` and `status`, and a `vms` file on the card
places programs at boot.

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
`wm/logon` (or straight past it, with `skiplogon`) and the interface chosen
there — **Lucia**, or the classic **Desktop** (`wm/wm` and a shell). The first
boot asks for a new password, which makes the machine's secstore account on
the card. The serial console is *still* a shell with the full namespace.

On a touch screen — the Pi's DSI panel, or a USB touchscreen — a finger held
still for half a second is button 3 (every context menu), and two fingers
dragged are the wheel. With no keyboard attached, touching the screen brings
up **`wm/osk`**, InferNode's own keyboard on the screen: at the login screen in
secret mode (nothing typed is shown or learned), and in Lucia in a strip of
its own that goes away when a keyboard is plugged in.

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

**The quick way** is the release's image for your board, written to a card
whole:

| Board | Image |
|-------|-------|
| Raspberry Pi 5 | [`infernode-*-rpi5.img.xz`](/download/infernode/rpi5.img.xz) |
| Raspberry Pi 4B | [`infernode-*-rpi4b.img.xz`](/download/infernode/rpi4b.img.xz) |
| Raspberry Pi 3B+ | [`infernode-*-rpi3bplus.img.xz`](/download/infernode/rpi3bplus.img.xz) |

Use Raspberry Pi Imager's **Use custom** (with its OS customisation left off:
nothing on the card reads it), `dd`, or Etcher. The image is everything below,
with the radio's Wi-Fi firmware and Bluetooth patch included. The 3B+ and 4B
images are in Imager's own format — each release attaches the
`os_list_infernode.json` Imager reads — and every release image is checked as
the boot ROM and firmware read a card before it ships; the 3B+ and 4B images are
also booted under QEMU to the login screen.

To make one from your own tree, build the kernel and run

```sh
tools/mkpiimage.sh rpi4b /tmp/bm/bcm2711-kernel.img card.img   # or rpi3bplus / rpi5
```

which fetches the boot, Wi-Fi and Bluetooth firmware, pinned by hash, and puts
on the card only what git tracks of `lib/`, `fonts/` and `icons/`.

### By hand

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
  max_framebuffers=2
  core_freq=250
  core_freq_min=250

  [tryboot]
  kernel=tryboot.img
  cmdline=tryboot.cmd
  ```

  `tryboot.cmd` holds the single word `tryboot`. `core_freq` and
  `core_freq_min` hold the VPU clock still, which the serial console's baud
  rate depends on; `max_framebuffers=2` lets the panel and HDMI both appear.
- **`tryboot.txt`:** current firmware reads it *instead of* `config.txt` after
  a tryboot reset and ignores the `[tryboot]` section, so without it a
  candidate kernel silently never runs. It is `config.txt` with
  `kernel=tryboot.img` and `cmdline=tryboot.cmd` in place of the kernel's two
  lines, and no section.
- **The kernel** for your board, on the card as **`infernode8.img`**.
- **Userspace**, from a built tree: `dis/`, `lib/`, `fonts/`, `icons/`, and
  `usr/inferno` — the machine's writable home, where the first boot makes its
  secstore account. Leave out `usr/inferno/keyring/default`: it is a test key,
  and would otherwise be the same key on every card.
- **Radio firmware**, if you want Wi-Fi: `tools/pi-firmware.sh` fetches and
  checks it; Bluetooth also wants `firmware/BCM4345C0.hcd`
  (`tools/pi-firmware.sh --manifest tools/pi-btfw-manifest.txt CARDROOT`).

You need a **3.3 V USB-serial cable on GPIO 14/15** (115200 8N1). The console
is mirrored to HDMI once the framebuffer is up, but everything before that,
and every panic, is on the serial line only.

Each board has its own files and differences. The Pi 4B uses `start4.elf`,
`fixup4.dat` and its own kernel image. The Pi 5 keeps its firmware in EEPROM,
so the card holds `kernel_2712.img`, `config.txt` and the
`bcm2712-rpi-5-b.dtb` and `bcm2712d0-rpi-5-b.dtb` device trees instead, and
its serial console is on RP1's UART. The
[full manual](https://github.com/infernode-os/infernode/blob/master/docs/BAREMETAL.md)
lists them, along with updating the kernel without pulling the card, the
control files on the card, and debugging a boot.
