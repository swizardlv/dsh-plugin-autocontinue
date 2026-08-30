// #region lib/index.js
/**
 * dsh-plugin-autocontinue — Host half.
 *
 * When an agent turn fails (`turn/end` with `reason.kind === "error"` — the same
 * event the UI renders as "本轮运行失败"), automatically send the agent a
 * "请继续" user message so it starts a new turn and keeps working.
 *
 * Safety rails:
 *  - Consecutive-failure counter per agent; stops after `maxRetries` until the
 *    user actively sends a message (which re-arms the counter).
 *  - Sends at most once per failed turn (pending token).
 *  - Waits until the agent is idle before waking it, so `followup()` lands.
 *  - Never throws into the session; all failures are logged via ctx.logger.
 *
 * @module dsh-plugin-autocontinue
 */

import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";

/** Cordis function-plugin name. */
export const name = "autocontinue";

/** Services required before this plugin can operate. */
export const inject = ["agents"];

/** Settings namespace for the GUI card. */
export const NS = "autocontinue";

/** Defaults, used when no settings service or cordis config is present. */
export const DEFAULTS = {
	enabled: true,
	maxRetries: 3,
	delayMs: 5000,
	message: "请继续",
	scope: "all"
};

/** Runtime schema for {@link Config} and the settings namespace. */
export const Config = z.object({
	enabled: z.boolean().default(true),
	maxRetries: z.number().step(1).min(1).max(100).default(3),
	delayMs: z.number().step(1).min(0).max(600000).default(5000),
	message: z.string().default("请继续"),
	scope: z.union([z.const("all"), z.const("roots")]).default("all")
});

/** Bound re-checks when the agent is still busy past `delayMs`. */
const MAX_IDLE_WAIT_ATTEMPTS = 10;
const IDLE_WAIT_STEP_MS = 500;

/** Normalize a possibly-partial runtime config against the defaults. */
function normalize(config) {
	return {
		enabled: config?.enabled ?? DEFAULTS.enabled,
		maxRetries: config?.maxRetries ?? DEFAULTS.maxRetries,
		delayMs: config?.delayMs ?? DEFAULTS.delayMs,
		message: config?.message ?? DEFAULTS.message,
		scope: config?.scope ?? DEFAULTS.scope
	};
}

/**
 * Install the plugin on one live agent: observe its session events, track
 * consecutive failures, and schedule the auto-continue followup.
 *
 * @param ctx - root plugin context.
 * @param agent - live agent from `agent/created`.
 * @param state - per-agent WeakMap state.
 * @param config - a getter returning the current runtime config.
 */
function attachAgent(ctx, agent, state, config) {
	const { sessions, failures, pending, disposed } = state;
	if (sessions.has(agent)) return;
	sessions.add(agent);

	const isTarget = () => {
		const cfg = config();
		if (!cfg.enabled) return false;
		if (cfg.scope === "roots") return ctx.agents.roots().includes(agent);
		return true;
	};

	/** Send the followup exactly once, clearing any pending token. */
	const sendNow = () => {
		const timer = pending.get(agent);
		if (timer !== void 0) {
			clearTimeout(timer);
			pending.delete(agent);
		}
		const cfg = config();
		try {
			agent.followup(createUserMessage({
				content: [{ type: "text", text: cfg.message }],
				source: { kind: "plugin", plugin: name }
			}));
			ctx.logger.info(`autocontinue: agent "${agent.id}" turn failed; sent auto-continue "${cfg.message}"`);
		} catch (error) {
			ctx.logger.warn(`autocontinue: followup failed for agent "${agent.id}": ${String(error)}`);
		}
	};

	/** Bounded wait for idle, then send. */
	const waitIdleAndSend = (attempt) => {
		if (attempt >= MAX_IDLE_WAIT_ATTEMPTS) {
			pending.delete(agent);
			return;
		}
		const timer = setTimeout(() => {
			if (disposed.has(agent) || ctx.agents.get(agent.id) !== agent) {
				pending.delete(agent);
				return;
			}
			if (agent.status === "idle") sendNow();
			else waitIdleAndSend(attempt + 1);
		}, IDLE_WAIT_STEP_MS);
		pending.set(agent, timer);
	};

	/** Schedule the followup after `delayMs`; skip if already pending. */
	const scheduleSend = () => {
		if (pending.has(agent)) return;
		const timer = setTimeout(() => {
			if (disposed.has(agent) || ctx.agents.get(agent.id) !== agent) {
				pending.delete(agent);
				return;
			}
			if (agent.status === "idle") sendNow();
			else waitIdleAndSend(0);
		}, config().delayMs);
		pending.set(agent, timer);
	};

	/** Handle one turn failure: bump counter, schedule if under the cap. */
	const handleFailure = () => {
		if (!isTarget()) return;
		const cap = config().maxRetries;
		const count = (failures.get(agent) ?? 0) + 1;
		if (count > cap) {
			// Reached the cap: park at the stopped marker (never back to 0 here),
			// so further failures stay silent until a success or user message resets.
			failures.set(agent, cap + 1);
			ctx.logger.info(`autocontinue: agent "${agent.id}" failed ${cap} consecutive times; auto-continue stopped until a success or a user message`);
			return;
		}
		failures.set(agent, count);
		scheduleSend();
	};

	const offSession = agent.ctx.on("session/event", (session, event) => {
		if (session !== agent.session) return;
		if (event.type !== "turn/end") return;
		if (event.data?.reason?.kind === "error") handleFailure();
		else failures.set(agent, 0);
	});

	const offInbox = agent.ctx.on("agent/inbox/inserted", ({ message }) => {
		if (message?.source?.kind === "user") {
			failures.set(agent, 0);
			const timer = pending.get(agent);
			if (timer !== void 0) {
				clearTimeout(timer);
				pending.delete(agent);
			}
		}
	});

	const offDisposed = agent.ctx.on("agent/disposed", () => {
		const timer = pending.get(agent);
		if (timer !== void 0) clearTimeout(timer);
		disposed.add(agent);
		pending.delete(agent);
		failures.delete(agent);
		sessions.delete(agent);
	});

	return () => {
		const timer = pending.get(agent);
		if (timer !== void 0) clearTimeout(timer);
		pending.delete(agent);
		offSession();
		offInbox();
		offDisposed();
		sessions.delete(agent);
	};
}

/** Cordis plugin body. */
export function apply(ctx, config) {
	const state = {
		sessions: new Set(),
		failures: new WeakMap(),
		pending: new WeakMap(),
		disposed: new WeakSet()
	};
	let runtime = normalize(config);
	const detachers = new Set();

	// Live configuration from the settings namespace (GUI-editable), falling
	// back to the cordis config / defaults when the service is unavailable.
	ctx.inject(["settings"], (settingsCtx) => {
		let scope;
		try {
			scope = settingsCtx.settings.register(settingsNamespace(NS), Config, {
				base: config ?? DEFAULTS
			});
		} catch (error) {
			ctx.logger.warn(`autocontinue: settings namespace registration failed: ${String(error)}`);
			return;
		}
		const sync = () => {
			try {
				runtime = normalize(scope.get());
			} catch (error) {
				ctx.logger.warn(`autocontinue: settings read failed: ${String(error)}`);
			}
		};
		sync();
		scope.watch(sync);
	});

	ctx.effect(() => {
		const offCreated = ctx.on("agent/created", ({ agent }) => {
			if (state.disposed.has(agent)) return;
			const detach = attachAgent(ctx, agent, state, () => runtime);
			detachers.add(detach);
		});
		// Late-loaded plugins: cover agents that already exist.
		for (const agent of ctx.agents.list()) {
			if (state.disposed.has(agent)) continue;
			const detach = attachAgent(ctx, agent, state, () => runtime);
			detachers.add(detach);
		}
		return () => {
			offCreated();
			for (const detach of detachers) detach();
			detachers.clear();
		};
	}, "autocontinue.lifecycle()");
}
// #endregion
