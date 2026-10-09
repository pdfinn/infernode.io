---
title: "Retiring RC4 from login, and adding ML-KEM, ML-DSA and SLH-DSA"
description: "In two days we replaced the last 40-bit cipher in Inferno's login protocol, added native FIPS 203, 204 and 205, and then found that our 49 passing tests had missed a signature bug that failed one time in two hundred."
pubDate: 2026-03-07
author: "P. D. Finn"
tags: ["crypto", "post-quantum", "security"]
---

A namespace is only as strong as the channel that carries it. In Inferno®, a namespace can include a remote machine's files mounted over 9P. Authentication decides who may mount what, and the login protocol establishes the keys for that. If the cryptography under the namespace is weak, isolation stops where the network begins. That makes cryptography part of the containment story, not a side topic.

When we forked, the authentication stack was very much of the 1990s. In January we made Ed25519 the default signature algorithm, moved certificate and password hashing from SHA-1 to SHA-256, and raised default key sizes to 2048 bits. In February we added a TLS 1.3 client. Three gaps were still open. Login protected its Diffie-Hellman exchange with RC4 and a 40-bit key. SSL3 would still negotiate suites nobody should. And nothing was ready for a quantum adversary. On 5 March three pull requests went after all three: [#32](https://github.com/infernode-os/infernode/pull/32), [#33](https://github.com/infernode-os/infernode/pull/33) and [#34](https://github.com/infernode-os/infernode/pull/34).

This is also the second round of an experiment we began with [TLS 1.3](/blog/native-tls-13/): can AI-assisted development implement robust cryptography? TLS used well-established primitives with published RFC and NIST vectors behind them. Post-quantum schemes are newer, larger and less forgiving, which makes them the sterner test.

## Removing the 40-bit key

The login protocol (`appl/lib/login.b` on the client, `appl/cmd/auth/logind.b` on the server) is an encrypted key exchange: a key derived from the password encrypts the DH value in transit. That key used to be SHA-256 folded down to 8 bytes and fed to RC4-40, with no authentication at all. [It is now](https://github.com/infernode-os/infernode/commit/8a74ddb573236c84dcd7c8e2b8919939567713af) ChaCha20-Poly1305 with a 32-byte key, SHA-256(SHA-256(pw) ‖ salt), and a 16-byte tag, so a tampered exchange is rejected. Old clients and new servers no longer talk to each other. We chose a clean break over compatibility in January, and we are keeping to it. The same PR added an `is_weak_suite()` filter to SSL3 negotiation, which refuses NULL, RC4, DES, export-grade, anonymous and FORTEZZA suites. It also added CRL revocation checking to X.509 path validation, from `/lib/crls/`.

## Plan in the morning, code by lunch

The [plan document](https://github.com/infernode-os/infernode/blob/2ee4430a80ba720aed2d0f3b025a3d318b7d3e1d/docs/QUANTUM-SAFE-CRYPTO-PLAN.md), written that morning, sets out the reasoning. The threat that matters now is harvest-now-decrypt-later, so key exchange comes before signatures. Primitives go in C in `libsec`, with no external libraries, and protocols stay in Limbo. Every security level is NIST Level 3 or 5. TLS use is hybrid, so a mistake in the new lattice code alone does not expose a session.

Thirty-five minutes after the plan was committed, [the implementation](https://github.com/infernode-os/infernode/commit/47d5de633f908063aa2469faebb64b4a004bfc10) landed:

- SHA-3 and SHAKE (Keccak-f[1600]), which both lattice schemes need
- ML-KEM-768 and -1024 (FIPS 203), exposed as raw-byte Keyring builtins
- ML-DSA-65 and -87 (FIPS 204), registered as signature algorithms next to Ed25519, so `auth/createsignerkey -a mldsa65` works
- hybrid `X25519MLKEM768` (IANA group 0x4588) in TLS 1.3, falling back to X25519; the shared secret is both 32-byte secrets concatenated
- ML-DSA OIDs for X.509

[Later that day](https://github.com/infernode-os/infernode/commit/9051e707db47a334512fc1d55e685223476cd5bb) came SLH-DSA (FIPS 205), as SLH-DSA-SHAKE-192s and -256s. It is a hash-based backstop with no lattice assumption, at the cost of 16,224- and 29,792-byte signatures.

We are open about the pace because the pace is the experiment. A few people with AI coding assistants wrote several thousand lines of post-quantum C, with tests, in one day. The real question is what it takes to trust that code.

## What the first tests caught

The [first round](https://github.com/infernode-os/infernode/commit/48d76f8d9d1938cd3eaa582376aa5a80ad95e61c) found four bugs. Two of them are about the environment rather than the mathematics:

- ML-KEM: Barrett reduction returns values in (-q, q), but the next step handled only [0, 2q), so negative coefficients corrupted the 12-bit encoding.
- ML-DSA: key generation wrote about 14 KB of raw `int32` coefficients into a 4,032-byte secret-key buffer, a heap overflow. FIPS 204 packs the coefficients by η, and we now do too.
- ML-DSA's working state did not fit in the emulator's 32 KB kernel-process stacks, so it moved to the heap.
- A base64 ML-DSA-87 key is about 8 KB, so the Keyring serialization buffer grew from 4,096 bytes to 16,384.

By the end of #34 we had 49 post-quantum tests, all passing. The SHA-3 tests use NIST CAVP known-answer vectors. The rest check sizes, round trips, wrong keys, tampering, uniqueness and serialization.

## What the 49 tests missed

The next day we [raised the bar](https://github.com/infernode-os/infernode/commit/4c9e37bff3dbac57f64dee1b4b96f30a71414030). The new stress tests ran 1,000 ML-KEM-768 and 500 ML-KEM-1024 round trips, and 100 ML-DSA-65 and 50 ML-DSA-87 keygen, sign and verify cycles, with 200 messages per key. A fuzz suite fed random and degenerate ciphertexts, keys and signatures. CBMC harnesses covered ML-KEM's constant-time helpers, the NTT and encoding round trips, and the reduction arithmetic.

The 200-messages-per-key test failed about one time in two hundred. The [cause](https://github.com/infernode-os/infernode/commit/760ec380b9bde20f11a2bfb5319e4d2a0f089b59) was a wrong constant. ML-DSA's Barrett reduction for q = 8,380,417 used 16,777,259 where it needed about 16,793,614, so now and then it returned a value in [q, 2q). That pushed `decompose` out of range, and the signer and verifier then disagreed about the high bits. The fix follows the reference implementation's approach: since q is close to 2^23, `t = (a + (1<<22)) >> 23`. All 26 stress and fuzz tests now pass.

Every test we had written passed, and the code was still wrong. Small-sample round trips cannot see a fault that shows up in 0.5% of signatures. Only volume could. The lesson matches February's TLS work: correctness has to be established by something independent of the process that produced the code. That means published vectors, live servers, sheer repetition, and bounded model checking.

## What is not yet shown

The lattice schemes have not been run against NIST known-answer vectors. The hybrid TLS test runs both sides locally. Until both are done, these implementations are tested against themselves and against volume, but not yet shown to interoperate. Sizes and migration commands are in [CRYPTO-MODERNIZATION.md](https://github.com/infernode-os/infernode/blob/master/docs/CRYPTO-MODERNIZATION.md).

So, can AI-assisted development produce robust post-quantum cryptography? Our answer after this week is the same as February's, with more evidence behind it. Writing the code is no longer the expensive part. Robustness is built afterwards, layer by layer: known-answer vectors where they exist, stress runs large enough to surface rare faults, fuzzing, and CBMC on the arithmetic. The first round of tests caught four bugs, and volume caught the one those tests missed. The process works, provided every layer is actually run.
