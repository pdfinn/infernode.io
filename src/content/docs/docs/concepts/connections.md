---
title: Connecting machines
description: Two machines share a namespace by mounting each other's files, authenticated by certificates and sealed by AES-256-GCM, with post-quantum key agreement underneath.
sidebar:
  order: 4
---

A remote machine is not a different kind of thing. You mount its files, and
they are names in your namespace like any others. This page is about what makes
that mount safe: who signed whom, how the ends agree a key, and what seals the
bytes on the wire.

## The shape of a connection

| Step | Mechanism | What it establishes |
|---|---|---|
| **Certify** | A signer issues each machine or user a certificate | Each end can prove who it is to anyone who trusts the signer |
| **Authenticate** | `Keyring->auth`, protocol version 2 | Mutual identity, and a shared secret from hybrid Diffie-Hellman and ML-KEM |
| **Seal** | ssl(3), `aes_256_gcm` by default | Every record encrypted and authenticated, one key each way |

`mount`, `listen`, `styxlisten`, `dial`, `cpu`, login, secstore, the grid
registries and the bare-metal cpu listener all take this path.

## Certificates from a signer

A signer is a machine holding a signing key in `/keydb/signerkey`, made by
[createsignerkey(8)](https://github.com/infernode-os/infernode/blob/master/man/8/createsignerkey).
The default algorithm is Ed25519; in CNSA mode, or with `-c`, it is ML-DSA-87.
`-a` chooses among `ed25519`, `mldsa65`, `mldsa87`, `slhdsa192s`, `slhdsa256s`,
`rsa`, `elgamal` and `dsa`.

Users are registered with
[changelogin(8)](https://github.com/infernode-os/infernode/blob/master/man/8/changelogin)
in `/keydb/keys`, and `svc/auth` serves
[logind(8)](https://github.com/infernode-os/infernode/blob/master/man/8/logind)
on the `inflogin` port (6673). A client fetches a certificate from it with
[getauthinfo(8)](https://github.com/infernode-os/infernode/blob/master/man/8/getauthinfo):

```sh
; getauthinfo default
```

It asks for the signer, user name and password. Answer `yes` to *save in file?*
and the certificate goes to `/usr/$user/keyring/default`, which `mount` and
`listen` read by default; otherwise it is served from memory over that name
until unmounted or restart.

The test suite makes a signer key and a certificate on one machine directly:

```sh
; auth/createsignerkey -f /tmp/keys/signer mysigner
; auth/mkauthinfo -k 'key=/tmp/keys/signer' $user /tmp/keys/default
```

ML-DSA and SLH-DSA signers hash certificates with SHA-384, classical ones with
SHA-256, and the certificate records which.

## Exporting and mounting

On the serving machine,
[listen(1)](https://github.com/infernode-os/infernode/blob/master/man/1/listen)
waits for connections, authenticates each one, and runs a command on it —
usually `export`, which serves a directory as 9P:

```sh
; listen -k /usr/$user/keyring/default -a aes_256_gcm 'tcp!*!styx' {export /usr/$user/shared}
```

On the other machine,
[mount(1)](https://github.com/infernode-os/infernode/blob/master/man/1/bind)
dials it, authenticates with its own certificate, and attaches:

```sh
; mount -k /usr/$user/keyring/default -C aes_256_gcm tcp!server!styx /n/server
```

Neither flag is needed in the ordinary case. With no `-a`, `listen` requires
AES-256-GCM; with no `-C`, `mount` asks for it; and both default to
`/usr/$user/keyring/default` for the certificate. `-A` on either side turns off
authentication and encryption entirely, and `-a none` must be asked for by name.

`styxlisten` takes the same flags but starts one 9P server for every client.
Before any key exchange, both allow 32 exchanges at once (`-L`), 8 new a second
(`-R`) and 4 from one address (`-P`), each with a 30-second deadline (`-T`).

:::caution[Listen exposes its namespace]
The command a listener runs sees its whole namespace. Export a narrow
directory, not `/`; a service running arbitrary commands needs a restricted
namespace too ([rstyxd(8)](https://github.com/infernode-os/infernode/blob/master/man/8/rstyxd)).
:::

## Node authentication, protocol version 2

The handshake is Station-to-Station: each side sends a Diffie-Hellman value,
its certificate and its public key, and signs the transcript. In version 2 each
side also sends an ephemeral ML-KEM-768 public key and encapsulates to the
other's, so there are two KEM secrets as well as the Diffie-Hellman one. Both
ML-KEM keys are bound into the signed transcript, now hashed with SHA-256, so an
attacker cannot swap one without breaking the signature. The session secret is

```text
SHA3-512("infernode-pq-sts-v2" || dh || kem_lo || kem_hi || ek_lo || ek_hi)
```

with the KEM secrets and keys ordered by comparing the public keys, so both ends
derive the same 64 bytes. It stays secret unless both the Diffie-Hellman and the
ML-KEM problem are broken — the answer to traffic recorded now and decrypted
later. Version 1 peers, which agreed by Diffie-Hellman alone and signed over
SHA-1, are refused, with no fallback.

## The line: ssl(3)

The handshake's secret keys
[ssl(3)](https://github.com/infernode-os/infernode/blob/master/man/3/ssl), the
record layer. Since 0.10.1 it has exactly two algorithms.

| Algorithm | What it does |
|---|---|
| `aes_256_gcm` (default) | Each record encrypted with a 16-byte tag over its data and two-byte header. Key and nonce from HKDF with SHA-384; record *n*'s nonce has *n* exclusive-ored into it, as TLS 1.3's |
| `hmac_sha384` | Data in the clear, each record carrying HMAC-SHA-384 of the record and its number. Integrity alone |

A record that is changed, cut, sent again, reordered, or sent back to the end
that sent it fails the read, and the connection is hung up. Each direction must
have its own secret of at least 32 bytes, and the same secret both ways is
refused; `secrets` in
[ssl(2)](https://github.com/infernode-os/infernode/blob/master/man/2/security-ssl)
derives one for each way from a shared secret with HMAC-SHA-384. A connection
carries at most 2³²−1 records each way. `sha256`, `aes_128_cbc`, `aes_256_cbc`
and the padded record are gone.

:::danger[Not compatible with older peers]
Both changes are on the wire. InferNode **cannot make an encrypted connection
to standard Inferno, nor to an InferNode older than 0.10.1**.
:::

`9cpu`, `import` and `9export` talk to Plan 9, whose p9sk1 authentication
agrees a 56-bit key — too weak to key either algorithm. They refuse encryption,
and without `-e` they run in the clear, for a network you already trust.

## Seeing what a namespace reaches

Since a remote machine arrives as a mount, the namespace says which machines
you reach. [ns2mmd(1)](https://github.com/infernode-os/infernode/blob/master/man/1/ns2mmd)
reads `ns` output and draws it as a Mermaid flowchart: this machine, each
machine a mount reaches, and an edge per mount labelled with its service and
mount point. Piped into `wm/page -s`, the picture follows the namespace as it
changes:

```sh
; {while {} {ns; echo; sleep 1}} | ns2mmd | wm/page -s
```

An encrypted mount's source in `ns` is its SSL conversation, `#D/0/data`, not a
dial string. The read-only file `#D/n/lower` names the channel that
conversation was pushed onto, such as `/net/tcp/3/data`; `ns2mmd` follows it to
the connection's `remote`, names the address from ndb, and marks the edge
**encrypted**. `-a` adds local servers' mounts. It reads this machine's files,
so another machine's namespace, seen through `cpu`, names what it cannot read.

## CNSA 2.0 mode

Set the host environment variable `CNSAMODE` before starting the emulator, and
it is reflected into `/env/cnsamode`. On a bare-metal board, a file named
`cnsamode` on the card does the same at boot by writing `cnsamode on` to the
kernel — a one-way switch, refused once anything has authenticated without it.

| In CNSA mode | Uses |
|---|---|
| Node authentication | ML-KEM-1024 instead of ML-KEM-768 |
| New signer keys | ML-DSA-87 by default |
| Login to a signer | Its Diffie-Hellman value sealed with AES-256-GCM under HKDF-SHA-384, not ChaCha20-Poly1305 |

Every node must agree: a mixed pair fails the key-length check, and each side's
error says which one is in CNSA mode. A signer in CNSA mode refuses a
ChaCha20-Poly1305 login and says why.

`CNSAMODE` does not touch TLS. `CNSATLS` (`/env/cnsatls`) holds TLS to 1.3,
`TLS_AES_256_GCM_SHA384` and SecP384r1MLKEM1024 alone, which public servers do
not offer: it suits a network whose TLS servers are all its own.

## Under the algorithms

**TLS.** The TLS 1.3 client, the path to the web, offers X25519MLKEM768 first
with an X25519 share beside it, reaches P-256 and P-384 servers by
HelloRetryRequest, and speaks TLS 1.2. Nodes talk to each other over the
handshake above, not TLS.

**Random numbers.** Every generator is NIST's HMAC_DRBG with SHA-512
(SP 800-90A Rev. 1), one implementation shared by the emulator and the native
kernels and checked against NIST's CAVP vectors before its first output. The
emulator seeds it from the host's generator and reseeds every 1M bytes, every
65536 requests and after a fork; with no host generator it gives nothing rather
than fall back. The native kernels seed it from the board's hardware generator
only, 64 bytes of entropy and a 16-byte nonce, every byte through SP 800-90B's
repetition-count and adaptive-proportion tests. A board with no generator makes
no key: readers wait, and the console says why. A kernel that fails the vectors
panics rather than make keys.

**Constant time.** AES-GCM's GHASH used to index a table by the running hash; it
is now PMULL where the processor has it and table-free integer multiplication
otherwise. AES and SHA-256 use the ARMv8 instructions where the core has them,
in the emulator and the native kernels. The P-256, P-384 and secp256k1 code is
checked under valgrind for branches or addresses that depend on a secret.

**Post-quantum algorithms.** ML-KEM-768 and -1024 (FIPS 203) for key
agreement; ML-DSA-65 and -87 (FIPS 204) and SLH-DSA-SHAKE-192s and -256s
(FIPS 205) for signatures, beside Ed25519.

## Guessing passwords

On master, after 0.10.1, logind limits online guessing (NIST SP 800-53 AC-7).
Ten logins in a row for a name that do not prove its password lock that name
for 60 seconds, refused before the password is looked up or any key exchanged.
An attempt counts when it begins and is cleared only when the client shows it
has the session key, so a hang-up or a time-out counts too. A name with no
account is counted, locked and answered in the same words, so neither the
throttle nor a single login tells which names exist. Counts live in
`/keydb/loginfail`; removing an entry ends a cooldown at once.

:::caution[What this does not do]
Protocol version and CNSA mode are never negotiated down: a fleet upgrades
together or splits. And the cipher protects the wire, not the endpoint — what a
client can do is what the exported directory lets it do. Details and history are
in [CRYPTO-MODERNIZATION.md](https://github.com/infernode-os/infernode/blob/master/docs/CRYPTO-MODERNIZATION.md).
:::

---

Next: [Design the interface first](/docs/concepts/design-first/) — how to build
something that composes with all of this.
