// 轻量验证：mock ctx/agent，驱动 lib/index.js 的 apply()，
// 验证自动继续、连续失败上限、成功清零、用户消息重置等核心行为。
import { apply, Config, DEFAULTS, NS } from "../lib/index.js";

function makeAgent(id) {
	const listeners = new Map();
	const agent = {
		id,
		session: { id },
		status: "idle",
		sent: [],
		_ctxListeners: listeners,
		ctx: {
			on(event, cb) {
				if (!listeners.has(event)) listeners.set(event, []);
				listeners.get(event).push(cb);
				return () => {
					const arr = listeners.get(event);
					if (arr) arr.splice(arr.indexOf(cb), 1);
				};
			}
		},
		followup(message) {
			this.sent.push(message);
			this.status = "running";
		}
	};
	agent.emit = (event, ...args) => {
		for (const cb of listeners.get(event) ?? []) cb(...args);
		// 模拟真实时序：turn/end 事件 append 后，kick() 随即退出，agent 回到 idle
		if (event === "session/event" && args[1]?.type === "turn/end") agent.status = "idle";
	};
	return agent;
}

// mock ctx
function makeCtx(config, extraAgents = []) {
	const agents = new Map(extraAgents.map((a) => [a.id, a]));
	const events = new Map(); // name -> cb list
	const ctx = {
		logger: { info: (...a) => console.log("[info]", ...a), warn: (...a) => console.log("[warn]", ...a) },
		agents: {
			list: () => [...agents.values()],
			roots: () => [...agents.values()].filter((a) => !a._ownedBy),
			get: (id) => agents.get(id),
			_register: (agent) => agents.set(agent.id, agent)
		},
		inject(_deps, cb) {
			// 提供 mock settings
			const stored = new Map();
			cb({
				settings: {
					register(ns, schema, opts) {
						const scope = {
							get: () => {
								const out = {};
								for (const [k, v] of stored) out[k] = v;
								return { ...DEFAULTS, ...(opts?.base ?? {}), ...out };
							},
							watch(cb2) { cb2(); return () => {}; },
							update(patch) { Object.assign(stored, patch); }
						};
						return scope;
					}
				}
			});
		},
		on(event, cb) {
			if (!events.has(event)) events.set(event, []);
			events.get(event).push(cb);
			return () => {};
		},
		effect(fn, label) {
			const disposer = fn();
			// 立即调用返回的清理函数？不——effect 的清理在 dispose 时。这里仅记录。
			this._effects ??= [];
			this._effects.push(disposer);
			return disposer;
		}
	};
	ctx.emit = (event, payload) => {
		if (event === "agent/created" && payload?.agent) ctx.agents._register(payload.agent);
		for (const cb of events.get(event) ?? []) cb(payload);
	};
	return ctx;
}

let pass = 0, fail = 0;
function check(name, cond) {
	if (cond) { pass++; console.log(`  ✓ ${name}`); }
	else { fail++; console.log(`  ✗ ${name}`); }
}
function flush(ms = 60) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const test = async () => {
	console.log("== 测试 1：失败后自动继续（scope=all）==");
	{
		const ctx = makeCtx({});
		apply(ctx, { enabled: true, maxRetries: 3, delayMs: 10, message: "请继续", scope: "all" });
		const agent = makeAgent("a1");
		ctx.emit("agent/created", { agent });
		// 模拟 turn 失败
		agent.status = "running";
		agent.emit("session/event", agent.session, { type: "turn/end", data: { reason: { kind: "error" } } });
		await flush(50);
		check("agent 收到 followup 消息", agent.sent.length === 1);
		check("消息文本为配置值", agent.sent[0]?.content?.[0]?.text === "请继续");
	}

	console.log("== 测试 2：连续失败达到 maxRetries 后停止 ==");
	{
		const ctx = makeCtx({});
		apply(ctx, { enabled: true, maxRetries: 2, delayMs: 5, message: "请继续", scope: "all" });
		const agent = makeAgent("a2");
		ctx.emit("agent/created", { agent });
		for (let i = 0; i < 4; i++) {
			agent.status = "running";
			agent.emit("session/event", agent.session, { type: "turn/end", data: { reason: { kind: "error" } } });
			await flush(30);
		}
		check("连续失败 4 次（上限 2）只自动继续 2 次", agent.sent.length === 2);
	}

	console.log("== 测试 3：成功一轮后计数清零 ==");
	{
		const ctx = makeCtx({});
		apply(ctx, { enabled: true, maxRetries: 1, delayMs: 5, message: "请继续", scope: "all" });
		const agent = makeAgent("a3");
		ctx.emit("agent/created", { agent });
		agent.status = "running";
		agent.emit("session/event", agent.session, { type: "turn/end", data: { reason: { kind: "error" } } });
		await flush(30);
		// 成功一轮
		agent.emit("session/event", agent.session, { type: "turn/end", data: { reason: { kind: "completed" } } });
		// 再失败一轮 → 计数已清零，应再继续一次
		agent.status = "running";
		agent.emit("session/event", agent.session, { type: "turn/end", data: { reason: { kind: "error" } } });
		await flush(30);
		check("成功清零后再次失败会再次继续（共 2 次）", agent.sent.length === 2);
	}

	console.log("== 测试 4：用户主动发消息重置计数 ==");
	{
		const ctx = makeCtx({});
		apply(ctx, { enabled: true, maxRetries: 1, delayMs: 5, message: "请继续", scope: "all" });
		const agent = makeAgent("a4");
		ctx.emit("agent/created", { agent });
		agent.status = "running";
		agent.emit("session/event", agent.session, { type: "turn/end", data: { reason: { kind: "error" } } });
		await flush(30); // 第 1 次继续
		// 达到上限后再失败 1 次（不再继续）
		agent.status = "running";
		agent.emit("session/event", agent.session, { type: "turn/end", data: { reason: { kind: "error" } } });
		await flush(30);
		check("达到上限后不再继续（仍 1 次）", agent.sent.length === 1);
		// 用户发消息 → 重置
		agent.emit("agent/inbox/inserted", { message: { source: { kind: "user" } } });
		agent.status = "running";
		agent.emit("session/event", agent.session, { type: "turn/end", data: { reason: { kind: "error" } } });
		await flush(30);
		check("用户消息后重新武装并再次继续（共 2 次）", agent.sent.length === 2);
	}

	console.log("== 测试 5：scope=roots 时子 agent 不处理 ==");
	{
		const ctx = makeCtx({}, []);
		apply(ctx, { enabled: true, maxRetries: 3, delayMs: 5, message: "请继续", scope: "roots" });
		const root = makeAgent("root");
		const child = makeAgent("child");
		child._ownedBy = root; // child 不是根
		root._ownedBy = void 0; // root 是根
		ctx.agents.roots = () => [root]; // 显式覆写 roots 过滤器
		ctx.agents.list = () => [root, child];
		// child 失败不应继续
		ctx.emit("agent/created", { agent: child });
		child.status = "running";
		child.emit("session/event", child.session, { type: "turn/end", data: { reason: { kind: "error" } } });
		await flush(50);
		check("roots 模式下子 agent 失败不自动继续", child.sent.length === 0);
		// root 失败应继续
		ctx.emit("agent/created", { agent: root });
		root.status = "running";
		root.emit("session/event", root.session, { type: "turn/end", data: { reason: { kind: "error" } } });
		await flush(50);
		check("roots 模式下根 agent 失败会自动继续", root.sent.length === 1);
	}

	console.log("== 测试 6：disabled 时不动作 ==");
	{
		const ctx = makeCtx({});
		apply(ctx, { enabled: false, maxRetries: 3, delayMs: 5, message: "请继续", scope: "all" });
		const agent = makeAgent("a6");
		ctx.emit("agent/created", { agent });
		agent.status = "running";
		agent.emit("session/event", agent.session, { type: "turn/end", data: { reason: { kind: "error" } } });
		await flush(30);
		check("disabled 时不自动继续", agent.sent.length === 0);
	}

	console.log(`\n结果：${pass} 通过，${fail} 失败`);
	if (fail > 0) process.exit(1);
};

test();
