# pi-read-only

A [Pi](https://pi.dev) extension that adds a **toggleable read-only mode**.

A session starts in normal **write** mode. Read-only is opt-in: toggle it on when you
want to inspect without modifying anything.

When read-only mode is on:

- `edit` and `write` are hidden from the model and blocked if called.
- `bash` is restricted to a read-only command allowlist (and destructive commands are denied outright).
- The model is told it is in read-only mode so it does not waste a turn attempting writes.

The mode persists in the session and is restored on resume.

## Install

```bash
pi install git:github.com/charles-rl/pi-read-only
```

Or try it for one run without installing:

```bash
pi -e git:github.com/charles-rl/pi-read-only
```

## Usage

| Action | Key / command |
|---|---|
| Toggle | `Alt+M` or `/readonly` |
| Turn on | `/readonly on` |
| Turn off (back to write) | `/readonly off` |
| Start in read-only | `pi --readonly` |

The current mode is shown in the footer as `mode: write` or `mode: read-only`.

## How it works

- A `tool_call` handler reads live state, so toggling takes effect immediately, even mid-turn, and also covers nested `codemode` tool calls.
- `setActiveTools` updates the tool set declared to the model on the next request.
- State is stored with `appendEntry` and restored on `session_start`.

This gates model-issued tools. Your own `!command` shell input is the separate `user_bash` event and is not gated.

The bash allowlist is a convenience guard, not a security boundary. For a hard boundary, combine this with a container or read-only filesystem mounts.

## License

MIT
