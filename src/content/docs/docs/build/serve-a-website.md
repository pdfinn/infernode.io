---
title: Serve a website
description: httpd(8) serves a directory of its own namespace over HTTP/1.1 and TLS 1.3, and sends only files.
---

:::note[In the source tree, not yet released]
`httpd` was merged on 13–14 November 2026, after release 0.10.1. Build from
the source tree to use it now. It ships in the next release.
:::

`svc/httpd/httpd` is a web server for a namespace. It serves one directory,
over HTTP/1.1, and over TLS 1.3 when it has a certificate and key. It serves
whatever is in that directory when a request arrives, including anything bound
or mounted under it.

There is no CGI. Dynamic content is a file server's business. Mount
[gpsfs](https://github.com/infernode-os/infernode/blob/master/man/4/gpsfs) in
the site, and a `GET` of its files reads the device.

## Each connection gets its own namespace

Every connection runs in a namespace made from the server's as it was started,
in these steps:

| Step | What it does |
|------|--------------|
| `pctl(FORKNS)` | A private copy of the server's namespace |
| `NEWENV` | An empty environment |
| `NEWFD` | No descriptors but the connection's, the clock's and the TLS module's entropy source |
| `bind root /` with `MREPL` | The site becomes `/` |
| `pctl(NODEVS)` | No device can be attached by name |

After that, `/` is the site and `..` from it is still the site. The server's
own `/dis`, `/dev`, `/prog` and `/net` are not there. In the hosted emulator a
host symbolic link in the site is not followed once `NODEVS` is set.

`tests/httpd_confine_test.b` holds the kernel to this, step by step.

:::tip[Denial is absence, on the web too]
httpd refuses `..` in a request before it reaches the namespace. Under that
check, a path that got past it would still name nothing outside the site. See
[Namespaces](/docs/concepts/namespaces/).
:::

## Serve a directory

```sh
; mkdir -p /services/www
; echo '<h1>hello</h1>' > /services/www/index.html
; svc/httpd/httpd -a 'tcp!*!8080' /services/www &
```

Without `-a`, httpd announces `tcp!*!80`, or `tcp!*!443` with TLS. A directory
is sent as its `index.html`. A directory without one is refused (403), unless
`-L` asks for listings. A name beginning with `.` is not found.

Files go out with a `Content-Type` by extension, an `ETag` from the file's
qid, `Last-Modified`, and `X-Content-Type-Options: nosniff`. Conditional
requests get 304 and a single byte range gets 206. A file whose stat length
is 0, such as a device's status file, is read to end of file and sent chunked.

## The flags that matter

| Flag | Meaning |
|------|---------|
| `-a addr` | Announce `addr` |
| `-c cert -k key` | Serve TLS 1.3 alone |
| `-L` | List directories that have no `index.html` |
| `-p path` | Take `POST` at `path`; may be given more than once |
| `-w wikibase` | Take wikifs's edit form at `/magic/wikipost` |
| `-T type` | Type of a name with no extension (default `application/octet-stream`) |
| `-C maxage` | `Cache-Control: max-age=maxage` on files that are not HTML pages |
| `-S secs` | `Strict-Transport-Security` with `max-age=secs` (TLS only) |
| `-r httpsport` | Redirect every request (301) to `https` at `httpsport` |
| `-l log` | Append each request in Apache's combined format (default: standard output) |
| `-m maxlog` | Rotate the log at this size: bytes, `k` or `m` (default `1m`; `0` never) |
| `-M oldlogs` | Old logs kept (default 2) |
| `-n maxconns` | Connections at once (default 64) |
| `-s persource` | Connections from one address (default 16) |
| `-b maxbody` | Largest `POST` body (default 65536) |
| `-A clientcas` | Ask for client certificates from these CAs |
| `-P passwords` | HTTP Basic passwords from this file |
| `-x rules` | Which paths need which proof |
| `-v` | Report refusals, failed handshakes and hang-ups on standard error |

A `POST` body replaces the file's contents in one write, as the shell's `>`
does. A request from another site (an `Origin` that is not this server's, or
a `Sec-Fetch-Site` that is not `same-origin` or `none`) is refused. Without
rules, a `-p` path is anyone's who can reach the server.

`-C` leaves pages out: their `ETag` is asked about each time, so a changed
site is seen at once.

Every phase of a connection has a deadline, from 10 seconds for the TLS
handshake to 30 for a file read. A connection past one is hung up.

## Compressed copies

httpd compresses nothing as it sends. Put `name.gz` beside `name`, made ahead
of time (the man page suggests `gzip -9 -k`), and a client whose
`Accept-Encoding` takes gzip gets the copy with `Content-Encoding: gzip`.
Other clients get the file itself. Both carry `Vary: Accept-Encoding`.

## Live pages from event files

A file asked for with an `Accept` naming `text/event-stream`, as a browser's
`EventSource` asks, is sent as Server-Sent Events. Each read of the file is
one event, and each line of it a `data:` line. A file whose read waits for a
change, such as gpsfs's `event`, becomes a live page.

Any file2chan file works. This one gives an event every second:

```sh
; load file2chan
; touch /services/www/tick
; file2chan /chan/tick {sleep 1; rread tick} {}
; bind /chan/tick /services/www/tick
```

Event streams have no read deadline. After 15 seconds with nothing to send,
httpd sends a comment line, which keeps the stream open through proxies and
finds clients that have gone. At most half of `maxconns` connections, and
half of `persource` from one address, hold event streams.

## Add TLS

`-c` names a PEM chain, leaf first, with an ECDSA P-256 key. `-k` names its
private key in PEM, either SEC1 (`EC PRIVATE KEY`) or PKCS #8
(`PRIVATE KEY`). httpd will not start if the key is not the certificate's.
On the host, OpenSSL makes a pair:

```sh
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
	-keyout web.key -out web.pem -days 365 -subj /CN=device.example \
	-addext subjectAltName=DNS:device.example
```

Key exchange is X25519MLKEM768 first, then X25519, then P-256. Of AES-128-GCM, AES-256-GCM and ChaCha20-Poly1305, httpd
picks the one fastest on this machine that the client offers, timed at start.
Clients offering only TLS 1.2 or earlier are refused. There is no resumption
and no early data.

## Who may have what

Client certificates and passwords work over TLS only. httpd will not start
with `-A` or `-P` and no `-c`.

| Proof | Flag | Source |
|-------|------|--------|
| Client certificate | `-A clientcas` | A PEM file of CA certificates, and their CRLs as `X509 CRL` blocks |
| Password | `-P passwords` | Lines made by `svc/httpd/passwd`: PBKDF2-HMAC-SHA-256, 100000 iterations unless `-i` says |

`svc/httpd/passwd` reads the password from standard input. httpd reads the
password file again when it changes. Ten wrong passwords from one network in
ten minutes, or fifty for one user, are refused (429) for the rest of the ten
minutes.

The rules file (`-x`) has one rule per line: an optional `GET` or `POST`, a
path, and terms. A request may have the path if it meets any one term.

| Term | Who |
|------|-----|
| `none` | Anyone |
| `password` | Any user |
| `password=user` | One user |
| `cert` | Any certificate from the CAs |
| `cert=cn` | The certificate whose common name is `cn` |
| `cert=sha256:hex` | The certificate whose DER has that SHA-256 |

A request's rule is the deepest whose path is its path or a directory of it.
A path no rule names is refused (403). A `realm words` line names the realm a
browser shows.

Rules also match by identity. A protecting rule for a path that existed when
httpd started applies to that file's qid and device too, so `/ADMIN` on a host
that folds case meets `/admin`'s rule. **Identity only adds a rule to meet,
never takes one away**: an accidental match can protect too much, never too
little.

```sh
; echo secret | svc/httpd/passwd alice > /keys/passwords
; echo 'realm The device' > /keys/rules
; echo '/		password cert' >> /keys/rules
; echo '/public	none' >> /keys/rules
; echo '/admin	cert=ops-laptop' >> /keys/rules
; svc/httpd/httpd -c /keys/web.pem -k /keys/web.key -A /keys/clientcas \
	-P /keys/passwords -x /keys/rules /services/www &
```

The checks come before anything in the site is opened, so a refusal says
nothing about what is there.

## A werc site, as files

[wercfs(4)](https://github.com/infernode-os/infernode/blob/master/man/4/wercfs)
serves a site laid out for werc as its finished pages: Markdown through
[mdhtml(2)](https://github.com/infernode-os/infernode/blob/master/man/2/mdhtml),
HTML and text in werc's master template, with werc's menu and title. Werc is
rc run as CGI; here it is a file server, and httpd only sends files.

Page names have no extension, as werc's URLs have none, so serve them with
`-T text/html`:

```sh
; mount {wercfs /usr/me/site} /services/www
; svc/httpd/httpd -T text/html -a 'tcp!*!8080' /services/www &
```

Pages are read-only and made when looked at, so an edit is seen at the next
request. Each page has a known length and a qid version that hashes what it
holds, so httpd gives it a `Content-Length`, an `ETag`, ranges and 304s.
wercfs runs with `NODEVS` too.

wercfs runs no rc. Of `_werc/config` it takes plain assignments and
`conf_hide_paths`, and reports each other line once on standard error.

## A wiki at /wiki

wikifs serves wiki pages. Mount it in the site, bind the store's `web/`
(its `index.html` and `create.html`) before it, and give httpd `-w`:

```sh
; mount {wikifs -d /services/wiki} /services/www/wiki
; bind -b /services/wiki/web /services/www/wiki
; svc/httpd/httpd -T text/html -w /wiki /services/www &
```

An edit of a page another writer has already changed is refused, kept in the
page's history, and sent to the page's `werror.html`. The form's `base` field
is not followed.

## Plain in front of TLS

```sh
; svc/httpd/httpd -c /keys/web.pem -k /keys/web.key -S 31536000 \
	-a 'tcp!*!8443' -l /services/logs/httpd /services/www &
; svc/httpd/httpd -r 8443 -a 'tcp!*!8080' /services/www &
```

:::caution
Give `-S` only for a certificate browsers trust: they then refuse the plain
address, and an untrusted certificate, for that long.
:::

## Not supported

HTTP/2 and HTTP/3 are not spoken. Passwords are HTTP Basic, so there is no
logging out. There is no ACME client. wercfs serves werc's pages, not its
apps. Full reference:
[httpd(8)](https://github.com/infernode-os/infernode/blob/master/man/8/httpd),
[wercfs(4)](https://github.com/infernode-os/infernode/blob/master/man/4/wercfs),
[sys-pctl(2)](https://github.com/infernode-os/infernode/blob/master/man/2/sys-pctl).
