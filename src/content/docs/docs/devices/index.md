---
title: Sensors and devices
description: Cameras, detectors, GPS, ships, aircraft and radio — each a 9P service you mount, read with cat, and grant or withhold like any other.
sidebar:
  order: 1
---

A sensor in InferNode is not a driver with an SDK. It is a file server: it
reads the hardware, or a feed from another machine, and serves what it means as
plain text files. A viewer, a map, a shell pipeline and an agent all read the
same files.

That has three consequences worth knowing before you start.

**It does not matter where the hardware is.** A camera on a Raspberry Pi, a
detector on a Jetson and the window you watch them in can be three machines.
Each mounts the others' files; nothing in the programs changes. See
[Namespaces](/docs/concepts/namespaces/#distribution-is-namespace-composition).

**Composition is a bind.** What is drawn over a video is a directory, and the
namespace stacks it: `bind -a` puts a layer on top, `unmount` takes it away.
Two viewers of one feed can show different layers because they have different
namespaces.

**An agent sees a sensor only when it is granted one.** The tools that read
sensors — `vision`, `gps` — come with grants that hold to the files that
describe the world, never to the ones that choose the receiver or reach the
camera's hardware. Without the tool, the sensor is not there at all.

## The pages

| Page | What it covers | Hardware |
|---|---|---|
| [Video and vision](/docs/devices/video-and-vision/) | Feeds (`vid9p`, `camsrv`), the camera window, JPEG between machines, object detection at `/mnt/vision`, drawn layers, `post` | A laptop and a `.y4m` clip for all of it; a Pi 4 camera or a Jetson for the real thing |
| [GPS, AIS, ADS-B and radio](/docs/devices/gps-and-radio/) | `gpsfs` at `/mnt/gps`, the moving map, the GPS as a clock, an RTL-SDR at `/mnt/sdr`, FM and AM | A GPS receiver, a marine or ADS-B gateway, or a log; an RTL-SDR dongle |

For microcontrollers mounted as files, and for running InferNode itself on the
board the sensors are wired to, see [Run on bare metal](/docs/bare-metal/) and
the [IoT and embedded systems](/iot/) page.
