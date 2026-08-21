---
title: 2. Connect a model
description: Veltro needs a language model. Point it at one before anything else will work.
sidebar:
  order: 2
---

Veltro is an agent, so it needs a model to think with. Nothing in the rest of
this quick start works until one is connected.

Which route you take depends on how you installed.

:::caution[Every route ends with a restart]
InferNode reads its model configuration at boot. After configuring one, **close
InferNode and relaunch it**. If you set up a key and Veltro still does not
answer, this is almost always why.
:::

## Windows — already done

`setup-windows.bat` configures a backend as part of extraction. If you ran it
in step 1, skip ahead to [Run the tour](/docs/quick-start/run-the-tour/).

## macOS and Linux, from a release — the first-run wizard

InferNode notices that no model is configured and Veltro opens with a greeting
and a dialogue titled **LLM Setup** in the conversation zone:

> Choose how to connect to an AI model:

Three buttons. Pick what matches what you have.

### Remote API

You have an Anthropic API key. The **Keyring** app opens:

1. Select **API Key**
2. Enter `anthropic` as the service
3. Paste your key

### Local model

You run Ollama or another OpenAI-compatible server. **Settings** opens on the
**LLM Service** panel:

1. Leave **Mode** on `Local`
2. Choose the Ollama backend
3. Set the URL, e.g. `http://localhost:11434/v1`

Ollama must be running *before* you start InferNode — `ollama serve`, or
`sudo systemctl start ollama`.

### Remote 9P

Another machine on your network is running InferNode and exporting `/mnt/llm`.
Settings opens on **LLM Service**:

1. Switch **Mode** to `Remote (9P)`
2. Enter that machine's dial address: `tcp!host!port`

The client needs no model, no API key, and no GPU — it mounts someone else's
model as a directory. This is the arrangement in
[Headless InferNode: mounting an LLM as a filesystem](https://github.com/infernode-os/infernode/blob/main/docs/HEADLESS-LLM-DAEMON.md).

:::note[Where the key goes]
Keys are held by **factotum**, InferNode's credential agent, not written into a
config file. Veltro cannot read them — its `keyring` tool can only *tell you*
that a credential is needed and open the app. Retrieving key material is outside
the agent's namespace entirely. Step 6 is about why that distinction matters.
:::

## From a clone — the guided script

If you built from source rather than downloading a release, there is a guided
setup that does the whole thing before you ever launch:

```sh
./setup-macos.sh      # or ./setup-linux.sh
```

It offers the same choice — Anthropic key or local Ollama — then validates the
key against the API, offers to add it to your shell profile, pulls the Ollama
model if you picked that route, and writes the config. It also offers to set up
an optional Brave Search key so Veltro can search the web.

These scripts are **not** in the release tarballs; they live in the repository.
Release users get the wizard above.

## Headless — edit the config

There is no wizard without a GUI. The same configuration is a file:

```sh
; cat /lib/ndb/llm
mode=local
backend=openai
url=http://localhost:11434/v1
model=your-model
dial=
```

The fields:

| Field | Values |
|---|---|
| `mode` | `local` — a backend on this machine or at a URL · `remote` — mount a remote `llmsrv` over 9P |
| `backend` | `api` — Anthropic · `openai` — any OpenAI-compatible server (Ollama, SGLang) · `cli` — a local Claude CLI gateway |
| `url` | Backend endpoint, e.g. `https://api.anthropic.com` or `http://localhost:11434/v1` |
| `model` | Model name to request |
| `dial` | Remote mode only: `tcp!host!5640` |

Optional: `auth=keyring` and `keyfile=` for authenticated remote mounts, and
`temperature=` to override sampling.

:::note[The file is yours, not the project's]
`lib/ndb/llm` is git-ignored — the tracked file is `lib/ndb/llm.example`, and it
ships blank on purpose. The boot profile seeds `$HOME/.infernode/lib/ndb/llm`
from that template on first run, and Settings writes the seeded copy thereafter.
A non-empty `url=` is what tells InferNode a model is configured, so a stray
value in the template would send a fresh install to an endpoint that does not
exist and skip the wizard that would have fixed it.
:::

For an API key without the GUI, set `ANTHROPIC_API_KEY` in the environment
before launching; the boot profile provisions it into factotum.

## A fourth option, if you have Claude Code

The Settings **LLM Service** panel also offers a **Claude CLI** backend
(`backend=cli`), which uses your host's existing `claude` login rather than an
API key. If Settings shows *"API key: not needed (uses host claude login)"*,
that is what it has picked up. The first-run wizard does not offer this one —
open Settings yourself.

## Verify

Relaunch InferNode. You have this step when the **LLM Setup** dialogue does
*not* appear — it only shows when no model is configured, so its absence is the
confirmation.

<div class="expected">

Then say anything at all in the conversation zone:

```
hello
```

If Veltro answers, you are done.

</div>

## Troubleshooting

**Configured it, still no reply** — you did not relaunch. This catches everybody.

**Ollama route, nothing responds** — Ollama is not running. Start it before
InferNode, not after.

**"keyring auth requested but keyfile not found"** at boot — the remote 9P route
expects a key at `/lib/keyring/serve-llm`. Generate one on the serving machine
with `./serve-llm.sh --gen-key`.

---

Next: [Run the tour](/docs/quick-start/run-the-tour/) — now that Veltro can
think, let it show you the system.
