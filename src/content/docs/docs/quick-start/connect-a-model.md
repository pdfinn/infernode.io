---
title: 2. Connect a model
description: Veltro needs a language model. Point it at one before anything else will work.
sidebar:
  order: 2
---

Veltro is an agent, so it needs a model to think with. Nothing in the rest of
this quick start works until one is connected.

You do not have to go looking for this. On first launch, InferNode notices that
no model is configured and Veltro opens with a greeting and a dialogue titled
**LLM Setup** in the conversation zone:

> Choose how to connect to an AI model:

with three buttons. Pick the one that matches what you have.

:::caution[All three paths end with a restart]
Whichever option you choose, InferNode must be **closed and relaunched** before
the model is live. The configurator says so when it finishes. If you configure a
model and Veltro still does not answer, this is almost always why.
:::

## Remote API — you have an Anthropic API key

The **Keyring** app opens. In it:

1. Select **API Key**
2. Enter `anthropic` as the service
3. Paste your key

Then close InferNode and relaunch.

:::note[Where the key goes]
Keys are held by **factotum**, InferNode's credential agent, not written into a
config file. Veltro cannot read them — its `keyring` tool can only *tell you*
that a credential is needed and open this app. Retrieving key material is
outside the agent's namespace entirely. Step 6 is about why that distinction
matters.
:::

## Local model — you run Ollama or similar

The **Settings** app opens directly on the **LLM Service** panel.

1. Leave **Mode** on `Local`
2. Choose the **Ollama** backend
3. Set the URL, e.g. `http://localhost:11434/v1`

Then close InferNode and relaunch.

This is the option to take on a machine with no internet, and the reason
InferNode works on an aircraft or behind an air gap.

## Remote 9P — another InferNode has a model

If a machine on your network is already running InferNode and exporting
`/mnt/llm`, you can borrow it. Settings opens on **LLM Service**:

1. Switch **Mode** to `Remote (9P)`
2. Enter the dial address of the exporting machine: `tcp!host!port`

Then close InferNode and relaunch.

This is the arrangement described in
[Headless InferNode: mounting an LLM as a filesystem](https://github.com/infernode-os/infernode/blob/main/docs/HEADLESS-LLM-DAEMON.md) —
one machine with the GPU, everything else mounting its model over the network as
a directory. The client machines need no model, no API key, and no GPU.

## Headless: edit the config directly

There is no wizard without a GUI. The same configuration is a file:

```sh
; cat /lib/ndb/llm
mode=local
backend=ollama
url=http://127.0.0.1:11434/v1
model=your-model
dial=
```

Five fields — `mode`, `backend`, `url`, `model`, `dial`. Write the file, restart
the emulator, done. On the host side this lives under
`$HOME/.infernode/lib/ndb/` and is bind-mounted into the namespace, so you can
edit it from either side.

For an API key without the GUI, set `ANTHROPIC_API_KEY` in the environment
before launching; the boot profile provisions it into factotum.

## A fourth option, if you have Claude Code

The Settings **LLM Service** panel also offers a **Claude CLI** backend, which
uses your host's existing `claude` login rather than an API key. If Settings
shows *"API key: not needed (uses host claude login)"*, that is what it has
picked up. The first-run wizard does not offer this one — you have to open
Settings yourself.

## Verify

Relaunch InferNode. You have this step when the **LLM Setup** dialogue does
*not* appear — that dialogue only shows when no model is configured, so its
absence is the confirmation.

<div class="expected">

Then say anything at all in the conversation zone:

```
hello
```

If Veltro answers, you are done. If nothing comes back, check that you actually
relaunched — see the caution at the top of this page.

</div>

## Troubleshooting

**Configured it, still no reply** — you did not restart. This catches everybody.

**"keyring auth requested but keyfile not found"** at boot — the remote 9P path
expects a key at `/lib/keyring/serve-llm`. Generate one on the serving machine
with `./serve-llm.sh --gen-key`.

**Windows** — `setup-windows.bat` configures a backend as part of extraction, so
you may find this step already done.

---

Next: [Run the tour](/docs/quick-start/run-the-tour/) — now that Veltro can
think, let it show you the system.
