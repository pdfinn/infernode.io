---
title: 1. Install and launch
description: Download a signed release for your platform and get InferNode on screen.
sidebar:
  order: 1
---

Releases ship as signed binaries for macOS, Linux, and Windows. There is no
toolchain to install and no build step — download, extract, run.

All downloads on this page come from the
[latest release page](https://github.com/infernode-os/infernode/releases/latest).

:::caution[Match the tarball to your CPU]
`amd64` is Intel and AMD. `arm64` is Jetson, Raspberry Pi, and Apple-Silicon
Linux. Running the wrong one fails with `ld-linux-aarch64.so.1: No such file`
or a similar loader error — that message means wrong architecture, not a broken
download.
:::

## macOS (Apple Silicon)

Download `infernode-*-macos-arm64.dmg`, open it, drag InferNode to
Applications, and launch it.

## Linux (x86_64 or ARM64)

Download `infernode-*-linux-amd64-gui.tar.gz` — or `-arm64-` for Jetson,
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

Download `infernode-*-windows-amd64-gui.zip` and extract it. Then, in order:

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
For a bare tarball instead, take `infernode-*-linux-amd64.tar.gz` (no `-gui`)
and run `./infernode-headless`.

You will land at the Inferno shell prompt, `;`, rather than in a window. Every
later step marks the terminal path where it differs.

## Verify

**With the GUI**, you should see a window in three zones, with a welcome
document already loaded:

<div class="expected">

- **Conversation** — where you talk to the agent
- **Presentation** — where documents, apps, and output appear
- **Context** — tool toggles, granted paths, and what the agent knows

</div>

The welcome document is `/lib/veltro/welcome.md`, displayed in the presentation
zone on first launch.

**Headless**, you should get a prompt and a version:

```sh
; cat /dev/sysctl
Fourth Edition (20120928)
```

That is InferNode reporting its own kernel version by way of a file, which is
the entire idea of the system and the subject of step 3.

:::note[Lucia]
The three-zone window is **Lucia**, InferNode's GUI. It is not a terminal
emulator with panes — each zone is a separate surface that programs and agents
write to through the filesystem, which is why an agent can put a document in
front of you without any GUI toolkit being involved.
:::

## Checking the download (optional)

Every release asset is published with a cosign bundle (`.pem` and `.sig`) and a
signed `SHA256SUMS.txt`. If you verify signatures as a matter of habit, they are
on the [release page](https://github.com/infernode-os/infernode/releases/latest)
next to the binaries.

## Troubleshooting

**`ld-linux-aarch64.so.1: No such file`** — wrong architecture. Get the other
tarball.

**Windows: nothing happens when you double-click `InferNode.exe`** — you skipped
`setup-windows.bat`. SmartScreen is blocking it silently. Run the `.bat`, then
try again.

**The window opens and closes immediately** — run the binary from a terminal
instead of a file manager so you can read the error it prints.

---

Next: [Run the tour](/docs/quick-start/run-the-tour/) — an agent shows you the
system it is running on.
