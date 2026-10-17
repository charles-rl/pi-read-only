# pi-read-only

A [Pi](https://pi.dev) extension that adds a **toggleable read-only mode**.

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
| Turn off | `/readonly off` |
| Start with writes enabled | `pi --editable` |

## How it works

- A `tool_call` handler reads live state, so toggling takes effect immediately, even mid-turn, and also covers nested `codemode` tool calls.
- `setActiveTools` updates the tool set declared to the model on the next request.
- State is stored with `appendEntry` and restored on `session_start`.

This gates model-issued tools. Your own `!command` shell input is the separate `user_bash` event and is not gated.

The bash allowlist is a convenience guard, not a security boundary. For a hard boundary, combine this with a container or read-only filesystem mounts.

## License

MIT
