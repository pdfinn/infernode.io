---
title: GPS, AIS, ADS-B and radio as files
description: A GPS receiver, the ships and aircraft it hears, and a software-defined radio, served as files you read with cat.
---

A GPS receiver is a byte stream. So is a marine gateway, an ADS-B box and an
RTL-SDR dongle. InferNode reads each one in a file server and gives you what it
means as text files. A map, a clock and an agent all read the same files.

| Server | Mounted at | Serves | Manual |
|---|---|---|---|
| `gpsfs` | `/mnt/gps` | your position, satellites, nearby ships and aircraft | [gpsfs(4)](https://github.com/infernode-os/infernode/blob/master/man/4/gpsfs) |
| `wm/road` | `#sroad/fs` | a moving map, and its view and marks | [wm-road(1)](https://github.com/infernode-os/infernode/blob/master/man/1/wm-road) |
| `timesync` | — | sets the clock from `/mnt/gps/time` | [timesync(8)](https://github.com/infernode-os/infernode/blob/master/man/8/timesync) |
| `sdrfs` | `/mnt/sdr` | an RTL-SDR's settings and samples | [sdrfs(4)](https://github.com/infernode-os/infernode/blob/master/man/4/sdrfs) |
| `sdr/fm`, `sdr/am` | — | sound from the samples | [sdr(1)](https://github.com/infernode-os/infernode/blob/master/man/1/sdr) |

## Start a receiver

You need a source of fixes: a receiver on a serial or USB port, a network
feed, a log, or a phone. `gpsfs` mounts itself at `/mnt/gps`. Any words after it are written to its
`ctl` file, so the source can be named on the command line:

```sh
; gpsfs source '#t/eia0' 9600
; cat /mnt/gps/position
40.784000 -74.416667
```

A serial port is always reachable by the kernel's name, `#t/eia0`. A USB
receiver on Linux appears after the `ttyS` ports; `#t/eia4status` names the
host device it is (`dev /dev/ttyACM0`).

`gpsfs` reads one source at a time. Each is one line written to `ctl`, and the
write returns when the source is open or fails with the reason:

| Hardware | Command |
|---|---|
| A serial or USB NMEA receiver | `source '#t/eia0' 9600` |
| A recorded log, read to its end | `source /usr/$user/track.nmea` |
| The same log, at the pace it was recorded | `replay /usr/$user/track.nmea` |
| A phone app serving NMEA over TCP | `source tcp!phone!11123` |
| `gpsd` (port 2947 by default) | `source gpsd host` |
| A boat's gateway sending NMEA 0183 and AIS over UDP | `source udp!*!10110` |
| An ADS-B receiver broadcasting GDL 90 (Stratux and the like) | `source gdl90 udp!*!4000` |
| A panel GPS's Garmin Aviation output | `source garmin '#t/eia0' 9600` |
| The host's location service | `source '#o/nmea'` |
| Nothing | `stop` |

With host `*`, `udp!*!port` listens for datagrams from any sender. GDL 90 and
Garmin's output are turned into the NMEA sentences a receiver would have sent,
so every file below means the same whatever the source.

```sh
; echo source udp!*!10110 > /mnt/gps/ctl
; cat /mnt/gps/traffic
kind=ais id=211234560 lat=53.543200 lon=9.987600 speed=6.3 course=87.6 heading=88 name='MV EXAMPLE' callsign=DABC cat=cargo age=4.2
```

:::note[`#o` on phones and desktops]
`#o` ([location(3)](https://github.com/infernode-os/infernode/blob/master/man/3/location))
is the host's location service as an NMEA receiver: CoreLocation on iOS, the
LocationManager on Android. The first open of `#o/nmea` starts the service and
the last close stops it. On other hosts it says `unavailable`, unless the
emulator was started with `INFERNODE_LOCATION_FAKE='lat lon [alt [accuracy]]'`,
which gives a fix a second moving north a metre a second, for trying a map on
a desk.
:::

## The files

| File | What it holds |
|---|---|
| `ctl` | read: the source in use; write: one command |
| `status` | `state=fix`, `nofix` or `nosource`, the link, the source, counts of sentences, bad ones and glitches held back, the fix's age |
| `position` | `latitude longitude` in decimal degrees; a read fails with `no fix` when there is none |
| `fix` | the last fix as `attr=value`: `time lat lon alt speed course heading mode q sats hdop err` and more, each only when the receiver sent it |
| `event` | each read waits for the next fix; every open has its own |
| `satellites` | one line a satellite: `system prn elevation azimuth snr used` |
| `traffic` | ships (AIS) and aircraft (ADS-B, FLARM) heard in the last ten minutes, nearest first |
| `time` | the fix's time beside this host's clock when it arrived, and `sync=yes` or `no` |
| `nmea` | the sentences as received, from the open on |
| `feed` | write-only: sentences written here are taken as the receiver's |

`gpsfs` also posts its files as `#sgps/fs`, so a program that did not see the
mount, such as an application started by Lucifer or an agent's tool, can
mount them:

```sh
; mount -A '#sgps/fs' /mnt/gps
```

:::caution[Not navigation equipment]
Nothing here is certified and there is no integrity monitoring. A phone's
position may come from Wi-Fi. A pressure altitude is as the device gives it,
not corrected for the local altimeter setting. Garmin's Aviation output and
GDL 90 carry no time with each fix, so `gpsfs` stamps them with this host's
clock.
:::

## A moving map

`wm/road` draws a map around `/mnt/gps`'s position: a grid, a scale bar, the
track so far, the accuracy as a circle, the heading as an arrow, and the
traffic `gpsfs` hears. `-w` sets the width of ground shown in metres (2000);
`-n` gives knots, feet and nautical miles.

It brings no map of its own. Lines and marks come from map files given on the
command line and from every file in `/lib/road`, one command a line:
`line [name]` followed by `lat lon` points, or `mark lat lon [name]`.

The map is driven through its own files, posted as `#sroad/fs`:

```sh
; mkdir -p /mnt/road
; mount -A '#sroad/fs' /mnt/road
; echo mark 40.6892 -74.0445 Liberty > /mnt/road/ctl
; echo width 500 > /mnt/road/ctl
; cat /mnt/road/view
```

`view` holds `center`, `width`, `follow on` or `off`, and `units metric` or
`nautical`. `ctl` takes those lines and `mark`, `unmark name`, `clear` and
`load mapfile`. `marks` lists the marks, and `event` gives `changed` when the
view or the marks change.

## GPS as a clock

A board in the field may have no network time. `timesync` sets the clock from
`/mnt/gps/time`, mounting the posted `#sgps/fs` itself if `/mnt/gps` is not in
its name space. Of five fixes it takes the least delayed one. If the clock is
off by more than 200 ms (`-t`) it is stepped through `/dev/time`.

```sh
; gpsfs source '#t/eia0' 9600
; timesync -p 600 &
```

Only fixes marked `sync=yes` count: a live receiver speaking NMEA. A recording,
a feed, GDL 90 and Garmin output say `no`. NMEA gives time to tens of
milliseconds at best; the receiver's pulse per second is not read, and `-o`
adds a correction measured once against a better clock.

## A software-defined radio

`sdrfs` serves an RTL-SDR (an RTL2832U with its tuner, the common USB dongle)
at `/mnt/sdr`. It does not drive the USB itself: it dials the host's
`rtl_tcp`, from librtlsdr. Run that on the machine with the dongle, bound to
loopback:

```sh
$ rtl_tcp -a 127.0.0.1
```

Then in InferNode:

```sh
; sdrfs source localhost
; cat /mnt/sdr/status
link=open source=tcp!127.0.0.1!1234 tuner=R828D gains=29 readers=0 bytes=0 dropped=0 skipped=0
; echo 'freq 1090M
rate 2M
gain 49.6' > /mnt/sdr/ctl
```

| File | What it holds |
|---|---|
| `ctl` | one setting a line: `freq`, `rate`, `gain auto` or dB, `ppm`, `agc`, `direct off\|i\|q`, `biastee`; a read gives them all |
| `status` | the link, source, tuner, readers, and bytes given, dropped and skipped |
| `gains` | the tuner's gains, dB, one a line |
| `iq` | the samples: 8-bit unsigned I then Q, 4.8 MB a second at 2.4M |

A write to `ctl` is checked whole first; if any line is refused, none is done.
The first reader of `iq` dials the radio and it is hung up 10 seconds (`-l`)
after the last leaves, so the dongle runs only while something listens. Every
open has its own queue, and one more than 8 MB behind loses the oldest samples.

## Listen

The server serves the radio, not what it hears. `sdr/fm` and `sdr/am` are
filters: samples in, 16-bit sound for `/dev/audio` out.

```sh
; echo 'freq 98.5M
rate 2.4M
gain 20' > /mnt/sdr/ctl
; echo rate 44100 > /dev/audioctl
; sdr/fm -r 2.4M -o 44100 < /mnt/sdr/iq > /dev/audio
```

`sdr/fm` is wide broadcast FM by default (mono) and narrow with `-n`, for
marine VHF, 2 m amateur and NOAA weather. `sdr/am` is for the air band:

```sh
; echo freq 121.5M > /mnt/sdr/ctl
; sdr/am -r 2.4M < /mnt/sdr/iq > /dev/audio
```

:::caution[rtl_tcp has no authentication]
Keep it on loopback. To use a radio on another machine, export `/mnt/sdr` from
there over authenticated 9P and mount it, never open `rtl_tcp`'s port. The
dongle cannot transmit. What you may listen to is the law of your country, and
nothing here enforces it.
:::

## What an agent can see

Following a receiver and changing what it says are separate files. Give an
agent the Veltro `gps` tool and its name space gets `/mnt/gps`'s `position`,
`fix`, `event`, `satellites`, `traffic`, `time` and `status`, and not `ctl`,
`feed` or `nmea`. It can learn where it is. It cannot choose the receiver or
put a position in.

A plain path grant of `/mnt/gps` without the tool gives nothing: the agent sees
no `/mnt/gps` at all. A location is personal data, and sending it anywhere is
a second capability, granted separately.

The radio follows the same rule. A process given `iq` hears what the radio is
tuned to; only one given `ctl` chooses.

