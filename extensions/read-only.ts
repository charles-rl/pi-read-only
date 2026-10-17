/**
 * Read-Only Mode (toggleable)
 *
 * Starts read-only. Toggle during a session with:
 *   /readonly            toggle
 *   /readonly on|off     set explicitly
 *   Alt+M                toggle
 *   pi --editable        start with write tools enabled
 *
 * Read-only = edit/write hidden from the model and blocked if called, and bash
 * restricted to a read-only command allowlist. The tool_call guard reads live
 * state, so toggling takes effect immediately, even mid-turn.
 *
 * Note: this gates model-issued tools (and nested codemode calls). Your own
 * `!command` shell input is the separate `user_bash` event and is not gated.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

const WRITE_TOOLS = new Set(["edit", "write"]);

// Deny these outright; everything else must also match the allowlist.
const DESTRUCTIVE = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/(^|[^<])>(?!>)/,
	/>>/,
	/\b(npm|yarn|pnpm|pip|apt|brew)\s+(install|uninstall|add|remove|update|upgrade|ci|publish)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|stash|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill(all)?\b/i,
	/\bpkill\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];
const SAFE = [
	/^\s*(cat|head|tail|less|more|grep|rg|find|fd|ls|pwd|tree|echo|printf|wc|sort|uniq|diff|file|stat|du|df|which|whereis|type|env|printenv|uname|whoami|id|date|cal|uptime|ps|top|htop|free|jq|awk|bat|eza)\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get|ls-)/i,
	/^\s*sed\s+-n/i,
	/^\s*(node|python|python3)\s+--version/i,
];

function isSafeCommand(command: string): boolean {
	return !DESTRUCTIVE.some((p) => p.test(command)) && SAFE.some((p) => p.test(command));
}

export default function readOnlyExtension(pi: ExtensionAPI): void {
	let readOnly = true;
	let toolsBefore: string[] | undefined;

	function apply(): void {
		if (readOnly) {
			toolsBefore ??= pi.getActiveTools();
			pi.setActiveTools(toolsBefore.filter((name) => !WRITE_TOOLS.has(name)));
		} else if (toolsBefore) {
			pi.setActiveTools(toolsBefore);
			toolsBefore = undefined;
		}
	}

	function showStatus(ctx: ExtensionContext): void {
		if (ctx.hasUI) ctx.ui.setStatus("read-only", readOnly ? ctx.ui.theme.fg("warning", "🔒 read-only") : undefined);
	}

	function setReadOnly(next: boolean, ctx: ExtensionContext): void {
		readOnly = next;
		apply();
		pi.appendEntry("read-only", { readOnly, toolsBefore });
		showStatus(ctx);
		ctx.ui.notify(next ? "Read-only mode enabled" : "Read-only mode disabled", "info");
	}

	// NOTE: Pi parses extension flags literally; `--no-<flag>` is NOT auto-generated,
	// so use an explicit opt-out flag instead.
	pi.registerFlag("editable", {
		description: "Start with write tools enabled (disables the read-only default)",
		type: "boolean",
		default: false,
	});

	pi.registerCommand("readonly", {
		description: "Toggle read-only mode, or pass 'on'/'off'",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			setReadOnly(arg === "on" ? true : arg === "off" ? false : !readOnly, ctx);
		},
	});

	pi.registerShortcut(Key.alt("m"), {
		description: "Toggle read-only mode",
		handler: async (ctx) => setReadOnly(!readOnly, ctx),
	});

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("editable") === true) readOnly = false;

		const last = ctx.sessionManager
			.getEntries()
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "read-only")
			.pop() as { data?: { readOnly?: boolean; toolsBefore?: string[] } } | undefined;
		if (last?.data) {
			readOnly = last.data.readOnly ?? readOnly;
			toolsBefore = last.data.toolsBefore;
		}

		apply();
		showStatus(ctx);
	});

	pi.on("tool_call", async (event) => {
		if (!readOnly) return;
		if (WRITE_TOOLS.has(event.toolName)) {
			return { block: true, reason: `${event.toolName} is disabled (read-only). Use /readonly off to allow writes.` };
		}
		if (event.toolName === "bash") {
			const command = String(event.input.command ?? "");
			if (!isSafeCommand(command)) {
				return { block: true, reason: `Read-only mode: command not allowlisted.\n${command}` };
			}
		}
	});

	// Tell the model, so it doesn't spend a turn attempting writes.
	pi.on("before_agent_start", async (event) => {
		if (!readOnly || event.messageType !== "user") return;
		return {
			message: {
				customType: "read-only-context",
				content:
					"[READ-ONLY MODE] File writes are disabled and bash is restricted to read-only commands. Investigate and report; do not attempt to modify files.",
				display: false,
			},
		};
	});
}
