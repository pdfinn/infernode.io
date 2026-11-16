---
title: 1. Install and launch
description: Download a signed release for your platform and get InferNode on screen.
sidebar:
  order: 1
---

Releases ship as signed binaries for macOS, Linux, and Windows, plus SD-card
images for the Raspberry Pi. There is no toolchain to install and no build
step — download, extract, run.

All downloads on this page come from the
[latest release page](https://github.com/infernode-os/infernode/releases/latest).

:::caution[Match the tarball to your CPU]
`amd64` is Intel and AMD. `arm64` is Jetson, Raspberry Pi, and Apple-Silicon
Linux. Running the wrong one fails with `ld-linux-aarch64.so.1: No such file`
or a similar loader error — that message means wrong architecture, not a broken
download.
:::

## macOS (Apple Silicon or Intel)

With Homebrew:

```sh
brew install --cask infernode-os/tap/infernode
```

Or download [`infernode-*-macos-arm64.dmg`](/download/infernode/macos-arm64.dmg) (Apple Silicon) or
[`infernode-*-macos-amd64.dmg`](/download/infernode/macos-amd64.dmg) (Intel), open it, drag InferNode to
Applications, and launch it.

## Linux (x86_64 or ARM64)

Download [`infernode-*-linux-amd64-gui.tar.gz`](/download/infernode/linux-amd64-gui.tar.gz) — or
[`-arm64-`](/download/infernode/linux-arm64-gui.tar.gz) for Jetson,
Raspberry Pi, and Apple-Silicon Linux. SDL3 is bundled, so there is nothing
else to install.

```sh
tar xzf infernode-*-linux-amd64-gui.tar.gz
cd infernode-*-linux-amd64-gui
./infernode
```

Optionally, add an app-menu icon and put `infernode` on your `$PATH`:

```sh
./setup-desktop.sh
```

`./setup-desktop.sh --no-path` installs the icon only, `--no-icon` the `PATH`
wrapper only, and `--uninstall` removes both.

## Windows (x86_64)

Download [`infernode-*-windows-amd64-gui.zip`](/download/infernode/windows-amd64-gui.zip) and extract it. Then, in order:

1. Double-click **`setup-windows.bat`**
2. Double-click **`InferNode.exe`**

:::caution[Run the .bat first — this step is not optional]
Windows tags browser-downloaded zips with the Mark of the Web and propagates
that tag to every extracted file, so SmartScreen silently blocks `InferNode.exe`.
`.bat` files are exempt from that gate, which is why `setup-windows.bat` can run
at all — clearing the tag from the bundle is the first thing it does. It also
configures an LLM backend while it is there.
:::

Windows code signing is provided by the [SignPath Foundation](https://signpath.org/),
a non-profit that signs open-source releases with certificates issued by SSL.com.

## Headless, container, or server

No GUI, no display, no problem:

```sh
docker run -it ghcr.io/infernode-os/infernode:latest
```

The image is multi-arch (amd64 and arm64) and carries SLSA build provenance.
For a bare tarball instead, take
[`infernode-*-linux-amd64.tar.gz`](/download/infernode/linux-amd64.tar.gz) or
[`-arm64`](/download/infernode/linux-arm64.tar.gz) (no `-gui`) and run
`./infernode-headless`. Windows has a headless zip too,
[`infernode-*-windows-amd64.zip`](/download/infernode/windows-amd64.zip).

You will land at the Inferno shell prompt, `;`, rather than in a window. Every
later step marks the terminal path where it differs.

## Raspberry Pi, with nothing underneath

InferNode can also *be* the operating system. Each release carries a card
image per board —
[`infernode-*-rpi5.img.xz`](/download/infernode/rpi5.img.xz),
[`-rpi4b`](/download/infernode/rpi4b.img.xz) and
[`-rpi3bplus`](/download/infernode/rpi3bplus.img.xz) — with the kernel,
the userspace and the radio firmware already on it. Write it to a card whole
with Raspberry Pi Imager's **Use custom** (leave OS customisation off; nothing
on the card reads it), `dd`, or Etcher, and boot the board.

That is a different machine from the hosted one this quick start follows. It
boots to the same login screen and desktop on a screen, or to a shell on the
serial console without one — see [Run on bare metal](/docs/bare-metal/).

## Verify

**With the GUI**, the first thing you see is the login screen. On the first
launch it asks you to choose a password and confirm it: that creates your
**secstore** account, where the keys you add later are kept between launches.
After that it asks for the password each time.

Under the password field are two choices:

- **Lucia** — the three-zone agent interface this quick start uses
- **Desktop** — a classic window manager (`wm/wm`) with a shell, and plumbing
  that opens files, folders, web pages and PDFs

Pick **Lucia** (click it, or use the up and down arrows) and press Enter. The
choice is remembered for the next launch. Pressing Escape twice goes on
without logging in — the desktop still starts, but nothing you store in
factotum survives a restart.

Once logged in you should see a window in three zones, with a welcome
document already loaded:

<div class="expected">

- **Conversation** — where you talk to the agent
- **Presentation** — where documents, apps, and output appear
- **Context** — tool toggles, granted paths, and what the agent knows

</div>

The welcome document is `/lib/veltro/welcome.md`, displayed in the presentation
zone on first launch.

If instead Veltro greets you with a dialogue titled **LLM Setup**, that is
expected on a fresh install — it means no model is configured yet, which is
exactly what the next step is for.

**Headless**, you should get a prompt and a version:

```sh
; cat /dev/sysctl
Fourth Edition (20120928)
```

That is InferNode reporting its own kernel version by way of a file, which is
the entire idea of the system and the subject of step 4.

:::note[Lucia]
The three-zone window is **Lucia**, InferNode's GUI. It is not a terminal
emulator with panes — each zone is a separate surface that programs and agents
write to through the filesystem, which is why an agent can put a document in
front of you without any GUI toolkit being involved.
:::

## Checking the download (optional)

Every release asset is published with a Sigstore bundle (`<file>.sigstore`), as
is the `SHA256SUMS.txt` that lists them all, and each release carries an SPDX
software bill of materials (`infernode-*-sbom.spdx.json`). If you verify
signatures as a matter of habit, they are on the
[release page](https://github.com/infernode-os/infernode/releases/latest) next
to the binaries.

## Troubleshooting

**`ld-linux-aarch64.so.1: No such file`** — wrong architecture. Get the other
tarball.

**Windows: nothing happens when you double-click `InferNode.exe`** — you skipped
`setup-windows.bat`. SmartScreen is blocking it silently. Run the `.bat`, then
try again.

**The window opens and closes immediately** — run the binary from a terminal
instead of a file manager so you can read the error it prints.

---

Next: [Connect a model](/docs/quick-start/connect-a-model/) — Veltro needs
something to think with before it can do anything.
