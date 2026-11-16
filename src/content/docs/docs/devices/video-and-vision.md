---
title: Video and vision
description: Cameras, video feeds and object detection, all as files — composed by bind, carried by 9P.
---

A camera in InferNode is a directory. So is a recorded clip, a detector, and
whatever is drawn over a picture. Nothing here has an API of its own: a viewer
reads a file, a detector reads the same file, and what is drawn on top is
whatever the viewer's namespace has bound in one directory.

## What each part needs

| Part | What it does | Runs on |
|------|--------------|---------|
| `vid9p` | A `.y4m` clip as a feed, played or replayed as live | Any machine |
| `camsrv` | A Camera Module 3 as a live feed | Raspberry Pi 4 (native kernel); `-t` on any machine |
| `wm/camera` | Shows a feed in a window | Any machine with a display |
| `videnc`, `vidjpeg` | JPEG on the hop between machines | Any machine |
| `visionfs` | Object detection at `/mnt/vision` on the CPU | Any machine, emulator or native kernel |
| `trtsrv` | A Jetson's GPU and DLAs as a vision engine | NVIDIA Jetson |
| `layerfs`, `post` | Layers written by hand; a mount offered to other namespaces | Any machine |

You can follow every section below on a laptop with one `.y4m` file. Only the
real camera and the Jetson engine need the hardware.

## The feed schema

Every video source serves the same files, under `/mnt/video/0`:

| File | |
|------|-|
| `fmt` | `w h i420 fps` |
| `frame` | Raw I420. Frame *N* is the frame size's bytes at offset *N* × framesize, the same for every reader |
| `status` | One line of `key=value`: `frames=` (one past the newest), `first=` (the oldest kept), and more |
| `ctl` | Commands to the source |
| `layer/` | Empty as served: what is drawn over the frames is bound here |

Because a frame's number is its offset, frame *N* means the same picture to
every reader on every machine. A read past the newest frame of a live feed
waits for it. A read below what is kept is refused with `frame expired`, and
readers go on from the newest.

## A clip as a feed: vid9p

`vid9p` serves a `.y4m` file. Make one on the host with ffmpeg, for example a
test pattern:

```sh
ffmpeg -f lavfi -i testsrc=size=320x240:rate=10 -frames:v 100 -pix_fmt yuv420p clip.y4m
```

Then, at the `;` prompt:

```sh
; mount {vid9p clip.y4m} /mnt/video
; cat /mnt/video/0/fmt
; cat /mnt/video/0/status
```

Playback is server state, driven by writing to `ctl`, so every viewer of the
feed shows the same frame:

```sh
; echo pause > /mnt/video/0/ctl
; echo 'seek +5000' > /mnt/video/0/ctl
; echo play > /mnt/video/0/ctl
```

With `-r` the clip is replayed as a **live** feed instead: frames arrive at the
file's rate, start again from the first after the last, and are numbered on.
What reads it sees a live source, as from a camera. It needs no host decoder,
so a bare-metal board with no camera can serve one.

```sh
; mount {vid9p -r clip.y4m} /mnt/video
```

`-w secs` bounds how much of a live feed is kept (60 seconds by default, `0`
for all of it). Writing `replay file.y4m` to `ctl` does the same as `-r`.

:::note[H.264 and other codecs]
Decoding happens outside the Dis VM, in a host process, and arrives as I420
over 9P. `vid9p -c` runs such a decoder, for example
`mount {vid9p -w 10 -c vdec cam.mp4 --y4m -} /mnt/video` with `tools/vdec`
built on the host. The design is in
[H264-9P-BRIDGE.md](https://github.com/infernode-os/infernode/blob/master/docs/H264-9P-BRIDGE.md).
:::

## A camera: camsrv

[camsrv(4)](https://github.com/infernode-os/infernode/blob/master/man/4/camsrv)
serves a Raspberry Pi Camera Module 3 on a Pi 4 in the same schema, so anything
that shows a feed shows the camera. With `-t` it serves a simulated sensor on
any machine — colour bars and a moving band, through the same code:

```sh
; mount -A {camsrv -t} /mnt/video
```

Pictures are 576×324 or 1152×648, up to 56 frames a second, 30 by default.
The sensor is on only while something has `frame` or `raw` open. Settings go to
`ctl`, one at a time:

```sh
; echo focus auto > /mnt/video/0/ctl
; echo fps 15 > /mnt/video/0/ctl
```

`mode`, `fps`, `flip` and `rotate` are refused while streaming. A camera
mounted on its side is turned by whoever starts camsrv (`-r 90`, or `rotate 90`
on `ctl`), so every reader gets the picture the right way up. On a bare-metal
Pi 4, a `camera` file on the card holds those lines; the system starts camsrv
on `/mnt/video` at boot and writes them to `ctl`.

:::caution[Stopping camsrv]
To stop it, unmount it. Killing one of its processes alone leaves the mount
without a server and its readers waiting; write `killgrp` to its process's
`ctl` instead.
:::

## Showing a feed: wm/camera

[wm/camera](https://github.com/infernode-os/infernode/blob/master/man/1/wm-camera)
shows the feed at `/mnt/video/0`, mounting camsrv there if nothing is. `+` and
`-` move the focus, `a` runs autofocus once, `q` exits. Hidden by the window
manager it lets go of the feed, and when nothing else reads it the camera goes
off. It shows a clip from `vid9p` just as well.

## Detection as files: visionfs

[visionfs(4)](https://github.com/infernode-os/infernode/blob/master/man/4/visionfs)
serves object detectors at `/mnt/vision`. Write a picture, read back what is in
it, one record a line.

### Getting a model

No model ships with the tree or the release. A model is a directory —
`graph`, `weights`, `classes`, `info`, `sha256` — made on the host from a
detector's ONNX file by `tools/vision/onnx2vis.py`. Only the YOLOX family is
converted. For YOLOX-nano's ONNX file:

```sh
tools/vision/onnx2vis.py --check yolox_nano.onnx lib/vision/yolox-nano
```

`--check` runs the converted graph with numpy against onnxruntime and fails if
they differ. visionfs refuses weights whose SHA-256 is not the one recorded,
and checks the graph before anything runs.

### A picture

```sh
; visionfs load nano /lib/vision/yolox-nano
; {
	id=`{read}
	cat photo.jpg > /mnt/vision/$id/image
	cat /mnt/vision/$id/detections
} < /mnt/vision/clone
class=dog score=0.86 x0=133 y0=207 x1=326 y1=543
class=bicycle score=0.80 x0=54 y0=137 x1=572 y1=423
```

Reading `clone` makes a session; it lasts while any of its files is open.
Its `ctl` takes settings a line at a time — `model`, `thresh` (0.30 at first),
`iou`, `classes dog car`, `rate`, `place` — and every line is checked before any
is done. `status` says `state=` and why, when something is wrong. A picture
can be any format the image loader reads.

### Following a feed

Write `src` and a feed's directory to a session's `ctl`, and each read of
`detections` is one frame's records, keyed by frame number and time:

```sh
; mount {vid9p dogs.y4m} /mnt/video
; {
	id=`{read}
	echo src /mnt/video/0 > /mnt/vision/$id/ctl
	cat /mnt/vision/$id/detections
} < /mnt/vision/clone
frame=0 pts=0 class=dog score=0.86 x0=133 y0=207 x1=326 y1=543
frame=1 pts=100 class=dog score=0.86 x0=133 y0=207 x1=326 y1=543
frame=2 pts=200
```

The `src` can be any feed: a clip, `vid9p -r`, `camsrv` or `camsrv -t`, here
or mounted from another machine. A frame with nothing in it is its key alone. The detector takes the newest
frame each time it is ready and never holds the feed back; `stats` counts what
it looked at and skipped. A clip that has ended is looked at whole, and the end
of the feed is the end of the file. `src none` sets the session idle again.

### Filters

[vision(1)](https://github.com/infernode-os/infernode/blob/master/man/1/vision)
gives three filters over these records. None needs a display.

```sh
; ls /photos/*.jpg | vision/detect | vision/draw -d /out -o png
; vision/detect *.jpg | grep 'class=dog' | vision/crop -d /tmp/dogs | vision/detect -m breeds
```

`-j n` runs *n* sessions at once. Quote a pattern with `=` in it: the shell
takes a bare `=` for an assignment.

### Another machine's detector

Which machine does the looking is which server is mounted at `/mnt/vision`:

```sh
; mount tcp!orin!vision /mnt/vision
```

On a Pi 4's native kernel, one core finds the objects in a 416×416 picture
in 276 ms with YOLOX-nano. The CPU engine is `$Tensor`, with NEON on arm64.

### The Jetson's GPU and DLAs: trtsrv

On a Jetson, `trtsrv` (`tools/trtsrv`, Rust, on TensorRT 10) serves TensorRT
engines as 9P on its standard input and output. The namespace mounts it, so it
is never on the network. `tools/trtsrv/mkengines.sh model.onnx modeldir` builds
engines for `gpu`, `dla0` and `dla1` into the model's directory. Then:

```sh
; mount -A {os trtsrv >[1=0]} /mnt/trt
; visionfs load yolox /lib/vision/yolox-nano
; echo engine /mnt/trt > /mnt/vision/ctl
; {
	id=`{read}
	echo place dla0 > /mnt/vision/$id/ctl
	cat dog.jpg > /mnt/vision/$id/image
	cat /mnt/vision/$id/detections
} < /mnt/vision/clone
```

`>[1=0]` joins the host command's output to the channel `mount` gives it. On an
Orin one inference takes 1.3 ms on the GPU and 8.4 ms on a DLA; a whole picture
through the files takes 54 to 62 ms, most of it moving the picture over 9P.

## Layers: what is drawn over a video

A feed's `layer/` directory holds what is drawn over it, a file a layer. A
layer is text, a record a line
([layers(2)](https://github.com/infernode-os/infernode/blob/master/man/2/layers)):

```text
frame=1234 box x0=320 y0=180 x1=384 y1=320 label=person
frame=1234 text x=10 y=10 label='3 people'
frame=* box x0=100 y0=80 x1=500 y1=400 label=door
```

`frame=*` is every frame. A detection is a box as it comes, so a vision
session's `layer/` is a layer already. The namespace stacks them: `bind -a`
puts a layer on top, `bind -b` underneath, and `unmount` takes it off, while
the window is up.

```sh
; bind -a /mnt/vision/1/layer /mnt/video/0/layer
; unmount /mnt/vision/1/layer /mnt/video/0/layer
```

Each viewer draws the stack its own namespace has, so two viewers of one feed
can show different layers. `wm/camera`, `vidplay9p` and Matrix's `video-pane`
draw them.

[layerfs(4)](https://github.com/infernode-os/infernode/blob/master/man/4/layerfs)
makes any file written into the stack a layer:

```sh
; mount -ac {layerfs} /mnt/video/0/layer
; echo 'frame=* box x0=100 y0=80 x1=500 y1=400 label=door' > /mnt/video/0/layer/roi
; cat /mnt/vision/1/detections | grep 'class=person' > /mnt/video/0/layer/people &
; rm /mnt/video/0/layer/people
```

A file keeps only what is due now: its records for the newest frame written,
and its `frame=*` records. `>` rewrites it; `>>` adds to it.

## Offering a mount to another namespace: post

[post(1)](https://github.com/infernode-os/infernode/blob/master/man/1/post)
posts a directory in `#s`, where any other namespace on the machine, or another
Dis VM, mounts it:

```sh
; vm 1 sh -c 'mount {vid9p clip.y4m} /mnt/video; post video /mnt/video'
; mount -A '#svideo/fs' /mnt/video
```

Here a feed served in another Dis VM is mounted in this one. Every connection
sees the one feed: frame *N* is the same frame on all of them. `post` runs until killed, and killing it ends its connections.

## A feed on another machine

A feed is files, so another InferNode mounts it over an authenticated,
encrypted 9P connection. Raw frames are large — about 8 MB/s at 30 frames a
second from the camera — so
[videnc(1)](https://github.com/infernode-os/infernode/blob/master/man/1/videnc)
compresses them as JPEG on the hop and leaves both ends raw. On the machine
with the feed:

```sh
; mount -a {videnc /mnt/video/0} /mnt/video/0
; listen -a aes_256_gcm tcp!*!17052 {export /mnt/video}
```

On the viewer:

```sh
; mount -C aes_256_gcm tcp!pi5!17052 /n/pi5
; mount {vidjpeg /n/pi5/0} /mnt/video
; wm/camera
```

`vidjpeg` serves the feed's files again, decoded, so `wm/camera`, `vidplay9p`
and visionfs read it unchanged. `echo quality 40 > /n/pi5/0/jpeg/ctl` lowers the
quality from either end. A frame is encoded once, when first asked for, however
many read it.

:::note[Authentication]
`listen` authenticates the other end with the certificate in
`/usr/$user/keyring/default` and, with no `-a`, requires AES-256-GCM. See
[listen(1)](https://github.com/infernode-os/infernode/blob/master/man/1/listen).
Never export `/mnt/video` anonymously off the machine.
:::

## Agents and vision

The Veltro `vision` tool no longer sends pictures to the cloud. Since 0.10.0 it
returns only what the detector at `/mnt/vision` finds, as records, and fails if
nothing is mounted there. There is no fallback. Its options are `-c` (classes)
and `-t` (threshold):

```sh
vision -c person,car /tmp/street.png
```

`/mnt/vision` is a fixed-function grant: an agent receives it only by being
given the `vision` tool, and a generic path grant of `/mnt/vision` is refused.
It is a picture's words, not a camera's frames — `/mnt/video` is never granted
with it, and the camera's hardware (`/dev/unicam`, the I2C files) is never
granted at all. An agent without the tool does not see `/mnt/vision`; in its
world, there is no detector.
