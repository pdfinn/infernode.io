---
title: "v0.3.0: bringing a 1990s handshake to post-quantum strength"
description: "The native 9P/Styx authentication protocol now mixes ML-KEM into its session key, and a fleet-wide CNSA mode moves both transports to ML-KEM-1024 and ML-DSA-87. This is the story of closing one gap we inherited."
pubDate: 2026-06-29
author: "P. D. Finn"
tags: ["crypto", "post-quantum", "release", "security"]
---

We started InferNode with a bet. If AI agents were going to run on real machines, the thing that had to be right was containment. The Plan 9 and Inferno® answer to containment already existed: per-process namespaces, every resource a file, and nothing reachable that is not in your namespace. So we forked Inferno. We knew what we were taking on. The last upstream release was around 2015, the code was dated even then, and it had picked up years of bit rot since. A second experiment ran alongside the first: whether a small team working closely with AI coding assistants could close a gap of more than ten years in a codebase like this one.

A namespace is only as strong as the channel that carries it between machines. That made June's work necessary, and [v0.3.0](https://github.com/infernode-os/infernode/releases/tag/v0.3.0), tagged yesterday, is the result.

## The gap we inherited

Node-to-node 9P/Styx traffic does not use TLS. It uses the native Inferno authentication protocol: `Keyring->auth`, a Station-to-Station (STS) handshake in `libinterp/keyring.c`, whose output keys the `ssl` line-encryption device. The design is elegant and dates from the 1990s, and it derived its session secret from classical Diffie-Hellman alone. We had preliminary ML-KEM (FIPS 203) and ML-DSA (FIPS 204) from v0.1, and our TLS client was described as offering a hybrid group. But two InferNode machines talking to each other did not use any of that. Anyone recording that traffic today could decrypt it later if discrete logs fell. That is harvest-now-decrypt-later, and it applied to the transport that carries the namespaces themselves.

## Protocol v2: hybrid STS

[PR #208](https://github.com/infernode-os/infernode/pull/208) makes the handshake hybrid. Each peer generates an ephemeral ML-KEM-768 keypair, the peers exchange public keys, and each encapsulates to the other. The exchange is symmetric because STS is. Both ML-KEM public keys go into the signed transcript, so an active attacker cannot substitute a KEM key without breaking the signature. The transcript hash moved from SHA-1 to SHA-256. The session secret is:

```
SHA3-512("infernode-pq-sts-v2" || dh || kem_lo || kem_hi || ek_lo || ek_hi)
```

ordered canonically by public key, so both peers derive the same 64 bytes. That is enough for a full key plus IV for any cipher the `ssl` device offers, so nothing downstream had to change. The session is safe unless both Diffie-Hellman and ML-KEM are broken.

It is a clean break. A v2 node refuses a v1 peer instead of falling back. If it fell back, the upgrade would protect nothing. `tests/pqauth_test.b` uses a man-in-the-middle relay that parses the wire framing to tamper with a KEM key, send a wrong-length key and attempt a downgrade. All three must fail.

This is also where the development approach shows. The implementation, the relay, and the negative cases were written with AI assistants. The bug found the same day was the kind you only find by running real keys through the code. v2 had raised `Maxbuf` to 49152, but eight field-size arguments in `readauthinfo`/`writeauthinfo` were still capped at the old 4096. `createsignerkey` was writing truncated ML-DSA and SLH-DSA keyfiles that the reader then rejected ([#209](https://github.com/infernode-os/infernode/pull/209)). After the fix, every signer type completed the live handshake, including a cross-architecture SLH-DSA-256s run with a transcript signature of about 29 KB. The assistants increase how much code we can write. Tests that use real inputs are how we keep that from also increasing how much wrong code we write.

## CNSA 2.0 strict mode

The NSA's CNSA 2.0 suite requires more than "some post-quantum": ML-KEM-1024, ML-DSA-87, SHA-384 or better, and AES-256. Our defaults are ML-KEM-768 and ed25519. We did not want two code paths, so we added one fleet-wide switch: the host `CNSAMODE` variable, which the emulator reflects into `/env/cnsamode`. Under that switch:

- The native STS handshake uses ML-KEM-1024 ([#268](https://github.com/infernode-os/infernode/pull/268)). `tests/cnsa_nodepair_test.sh` starts two separate emulators over TCP. Pairs in the same mode connect, and a mixed pair is rejected.
- `createsignerkey` and the first-run auth CA default to ML-DSA-87. A signer key grows from 651 bytes to 20043 ([#295](https://github.com/infernode-os/infernode/pull/295)).
- The TLS 1.3 client offers only **SecP384r1MLKEM1024** (`0x11ED`) ([#279](https://github.com/infernode-os/infernode/pull/279)). We chose P-384 because it is the CNSA-approved curve and X25519 is not. That required adding P-384 ECDH ([#277](https://github.com/infernode-os/infernode/pull/277), [#278](https://github.com/infernode-os/infernode/pull/278)).

We tested the TLS path against OpenSSL 3.6 (`tests/tls_cnsa_hybrid_test.sh`). The hybrid handshake succeeds, the classical path still works, and a CNSA client refuses a server that offers only X25519.

Wiring up TLS exposed an error in our own documentation. It said X25519MLKEM768 was already in the TLS handshake. It was not: `GROUP_X25519MLKEM768 = 0x4588` was a constant that nothing used. We corrected the record. The full inventory, with an implementation and a test named for each row, is in [docs/compliance/CNSA-2.0.md](https://github.com/infernode-os/infernode/blob/master/docs/compliance/CNSA-2.0.md). LMS/XMSS firmware signing is marked Not Applicable because InferNode ships no firmware.

## Bit rot, measured

Not all of this month's crypto work was new. Some of it was paying off what we inherited. [#237](https://github.com/infernode-os/infernode/pull/237) found two LP64 defects in pre-64-bit Plan 9 code, which upstream Inferno still has on any 64-bit Unix. `DSAprimes` filled a 20-byte seed through a `ulong*`, smashing 20 bytes of stack on every DSA keygen. The X9.17 PRNG key setup left 12 of its 24 key bytes zero.

The same PR fixed a bug of our own. Verifying our own ML-DSA signatures used to fail about 0.1-0.5% of the time. The cause was in `mldsa_decompose()`: in the FIPS 204 Algorithm 36 special case it set `r0` to `-1` instead of keeping its value, so the signer's rejection check compared the wrong magnitude for about 3% of coefficients. On a fixed seed, an ASan/UBSan harness went from 7 failures in 5000 rounds to 0, and then to 0 in 50000. An intermittent failure rate like that is easy to dismiss as noise. It took the decision to treat the flake as a defect to find it.

## Also in v0.3.0

- A YubiKey second factor for secstore login ([#256](https://github.com/infernode-os/infernode/pull/256)), with a backup key and a Settings panel. See [docs/second-factor-auth.md](https://github.com/infernode-os/infernode/blob/master/docs/second-factor-auth.md).
- A tamper-evident audit log at `/mnt/audit` ([#292](https://github.com/infernode-os/infernode/pull/292)), with ML-DSA-87 signing held by factotum ([#294](https://github.com/infernode-os/infernode/pull/294)).
- Pre-authentication hardening of the v2 handshake. Malformed or weak Diffie-Hellman shares no longer crash it, and the work a peer can force before authentication is bounded ([#257](https://github.com/infernode-os/infernode/pull/257), [#272](https://github.com/infernode-os/infernode/pull/272)).

The day after the tag we removed DES, RC4, IDEA, MD4, MD5 and SHA-1 from the `ssl` device ([#301](https://github.com/infernode-os/infernode/pull/301)). ML-DSA-87 certificates now hash with SHA-384 ([#304](https://github.com/infernode-os/infernode/pull/304)). Both are in v0.3.1.

## Where this is heading

The wire between nodes now meets the standard we want for the namespaces it carries. The harder question is inside a single node: whether the namespace an agent is given contains exactly what we intended and nothing more. That is where the next few weeks of work are going.
