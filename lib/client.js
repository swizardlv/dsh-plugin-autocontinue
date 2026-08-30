window.__ModuleLoader__.load({
	id: "dsh-plugin-autocontinue",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let jsx = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		// #region lib/types/client/index.js
		/**
		* dsh-plugin-autocontinue — Client half.
		*
		* Registers one settings card into the "Plugin configuration" tab
		* (`settings.plugin.item` keyed by the `autocontinue` namespace) so the
		* auto-continue behavior can be configured from the GUI. Reads and writes
		* ride the standard settings transport; the Host half watches the same
		* namespace and applies changes live.
		*
		* @module dsh-plugin-autocontinue/client
		*/
		/** Namespace this card edits (must match the Host half). */
		const NS = "autocontinue";
		/** Required browser services (cordis fiber inject). */
		const inject = ["slots", "locale", "settingsScope"];
		/** English copy. */
		const en = {
			title: "Auto-continue",
			description: "When a turn fails, automatically send the agent a message so it keeps working.",
			enabled: "Enabled",
			enabledHint: "When on, a failed turn triggers one auto-continue message.",
			maxRetries: "Max consecutive retries",
			maxRetriesHint: "Stops after this many consecutive failures, until you send a message.",
			delayMs: "Retry delay (ms)",
			delayMsHint: "How long to wait after a failure before continuing.",
			message: "Continue message",
			messageHint: "The user message sent to the agent on failure.",
			scope: "Scope",
			scopeHint: "all: every agent (main and sub-agents). roots: only root sessions.",
			scopeAll: "All agents",
			scopeRoots: "Root sessions only",
			save: "Save",
			saving: "Saving…",
			discard: "Discard",
			unsaved: "Unsaved",
			overridden: "Overridden",
			reset: "Reset to default",
			invalidNumber: "Enter a number.",
			readOnly: "This deployment stores settings read-only.",
			saveFailed: "The deployment did not accept these values."
		};
		/** Simplified Chinese copy. */
		const zh = {
			title: "自动继续",
			description: "当一轮运行失败时，自动给 agent 发送消息，让它继续工作。",
			enabled: "启用",
			enabledHint: "开启后，一轮失败会自动触发一次继续消息。",
			maxRetries: "最大连续重试次数",
			maxRetriesHint: "连续失败达到该次数后停止，直到你发送消息。",
			delayMs: "重试间隔（毫秒）",
			delayMsHint: "失败后等待多久再继续。",
			message: "继续消息",
			messageHint: "失败时发送给 agent 的用户消息。",
			scope: "作用范围",
			scopeHint: "all：所有 agent（主会话与子 agent）。roots：仅根会话。",
			scopeAll: "所有 agent",
			scopeRoots: "仅根会话",
			save: "保存",
			saving: "保存中…",
			discard: "放弃",
			unsaved: "未保存",
			overridden: "已覆盖",
			reset: "恢复默认",
			invalidNumber: "请输入数字。",
			readOnly: "此部署的设置只读。",
			saveFailed: "部署未接受这些值。"
		};
		/** Parse a text draft as a number, or undefined when invalid. */
		function parseNumber(text) {
			const trimmed = text.trim();
			if (trimmed === "") return void 0;
			const parsed = Number(trimmed);
			return Number.isFinite(parsed) ? parsed : void 0;
		}
		/** Read one field's effective value from the scope snapshot. */
		function valueOf(snapshot, field) {
			return snapshot?.value?.[field];
		}
		/** Build the staged draft map from the scope snapshot (deep-ish copy of scalars). */
		function seedDrafts(snapshot) {
			const drafts = {};
			for (const field of ["enabled", "maxRetries", "delayMs", "message", "scope"]) {
				const value = valueOf(snapshot, field);
				drafts[field] = typeof value === "boolean" ? value : typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
			}
			return drafts;
		}
		/** Plain inline styles, keyed on the DSH design tokens. */
		const css = {
			card: { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", borderRadius: "12px", listStyle: "none" },
			header: { appearance: "none", width: "100%", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer", background: "0 0", border: "0", borderRadius: "12px", alignItems: "center", gap: "12px", padding: "14px 16px", display: "flex" },
			headText: { flexDirection: "column", flex: "1", gap: "4px", minWidth: "0", display: "flex" },
			name: { color: "var(--dsw-alias-label-primary)", fontSize: "15px", fontWeight: "600", lineHeight: "1.4" },
			description: { color: "var(--dsw-alias-label-tertiary)", fontSize: "13px", lineHeight: "1.5" },
			pending: { whiteSpace: "nowrap", background: "var(--dsw-alias-bg-module-platform)", color: "var(--dsw-alias-label-secondary)", borderRadius: "999px", flex: "none", padding: "1px 8px", fontSize: "11px", fontWeight: "500", lineHeight: "17px" },
			chevron: { color: "var(--dsw-alias-label-tertiary)", flex: "none", transition: "transform .16s" },
			chevronOpen: { transform: "rotate(180deg)" },
			body: { borderTop: "1px solid var(--dsw-alias-border-l2)", margin: "0 16px", paddingBottom: "8px" },
			field: { flexDirection: "column", gap: "6px", padding: "12px 0", display: "flex" },
			head: { alignItems: "center", gap: "8px", display: "flex" },
			label: { minWidth: "0", color: "var(--dsw-alias-label-primary)", flex: "1", fontSize: "13px", fontWeight: "500", lineHeight: "1.5" },
			badges: { alignItems: "center", gap: "8px", display: "inline-flex" },
			badge: { whiteSpace: "nowrap", background: "var(--dsw-alias-bg-module-platform)", color: "var(--dsw-alias-label-secondary)", borderRadius: "999px", padding: "1px 8px", fontSize: "11px", fontWeight: "500", lineHeight: "17px" },
			reset: { font: "inherit", color: "var(--dsw-alias-label-secondary)", cursor: "pointer", background: "0 0", border: "none", padding: "0", fontSize: "12px", lineHeight: "1.5" },
			input: { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", height: "34px", font: "inherit", color: "var(--dsw-alias-label-primary)", borderRadius: "8px", padding: "0 12px", fontSize: "13px", lineHeight: "1.5" },
			select: { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", height: "34px", font: "inherit", color: "var(--dsw-alias-label-primary)", borderRadius: "8px", padding: "0 8px", fontSize: "13px", lineHeight: "1.5" },
			checkbox: { width: "16px", height: "16px", accentColor: "var(--dsw-alias-brand-primary)" },
			hint: { color: "var(--dsw-alias-label-tertiary)", margin: "0", fontSize: "12px", lineHeight: "1.5" },
			invalid: { color: "var(--dsw-alias-label-error)", margin: "0", fontSize: "12px", lineHeight: "1.5" },
			footer: { borderTop: "1px solid var(--dsw-alias-border-l2)", justifyContent: "flex-end", alignItems: "center", gap: "8px", padding: "12px 0 4px", display: "flex" },
			failed: { minWidth: "0", color: "var(--dsw-alias-label-error)", flex: "1", margin: "0", fontSize: "12px", lineHeight: "1.5" },
			discard: { appearance: "none", font: "inherit", cursor: "pointer", border: "1px solid var(--dsw-alias-border-l2)", color: "var(--dsw-alias-label-secondary)", background: "0 0", borderRadius: "8px", padding: "5px 14px", fontSize: "13px", lineHeight: "1.5" },
			save: { appearance: "none", font: "inherit", cursor: "pointer", border: "1px solid #0000", background: "var(--dsw-alias-button-info-fill)", color: "var(--dsw-alias-label-on-info)", borderRadius: "8px", padding: "5px 14px", fontSize: "13px", lineHeight: "1.5" }
		};
		/** Text value field. */
		function TextField(props) {
			return jsx.jsxs("div", { style: css.field, children: [
				jsx.jsxs("div", { style: css.head, children: [
					jsx.jsx("label", { style: css.label, htmlFor: props.id, children: props.label }),
					props.overridden ? jsx.jsxs("span", { style: css.badges, children: [
						jsx.jsx("span", { style: css.badge, children: props.overriddenLabel }),
						jsx.jsx("button", { type: "button", style: css.reset, disabled: props.disabled, onClick: props.onReset, children: props.resetLabel })
					] }) : null
				] }),
				jsx.jsx("input", { id: props.id, style: css.input, type: "text", value: props.text, placeholder: props.placeholder ?? "", disabled: props.disabled, onChange: (event) => props.onEdit(event.target.value) }),
				jsx.jsx("p", { style: props.invalid ? css.invalid : css.hint, children: props.invalid ? props.invalidLabel : props.hint })
			] });
		}
		/** Number value field. */
		function NumberField(props) {
			return jsx.jsxs("div", { style: css.field, children: [
				jsx.jsxs("div", { style: css.head, children: [
					jsx.jsx("label", { style: css.label, htmlFor: props.id, children: props.label }),
					props.overridden ? jsx.jsxs("span", { style: css.badges, children: [
						jsx.jsx("span", { style: css.badge, children: props.overriddenLabel }),
						jsx.jsx("button", { type: "button", style: css.reset, disabled: props.disabled, onClick: props.onReset, children: props.resetLabel })
					] }) : null
				] }),
				jsx.jsx("input", { id: props.id, style: css.input, type: "text", inputMode: "numeric", value: props.text, placeholder: props.placeholder ?? "", disabled: props.disabled, onChange: (event) => props.onEdit(event.target.value) }),
				jsx.jsx("p", { style: props.invalid ? css.invalid : css.hint, children: props.invalid ? props.invalidLabel : props.hint })
			] });
		}
		/** Boolean (checkbox) field. */
		function BooleanField(props) {
			return jsx.jsxs("div", { style: css.field, children: [
				jsx.jsxs("div", { style: css.head, children: [
					jsx.jsx("label", { style: css.label, htmlFor: props.id, children: props.label }),
					jsx.jsx("input", { id: props.id, style: css.checkbox, type: "checkbox", checked: props.checked, disabled: props.disabled, onChange: (event) => props.onEdit(event.target.checked) }),
					props.overridden ? jsx.jsxs("span", { style: css.badges, children: [
						jsx.jsx("span", { style: css.badge, children: props.overriddenLabel }),
						jsx.jsx("button", { type: "button", style: css.reset, disabled: props.disabled, onClick: props.onReset, children: props.resetLabel })
					] }) : null
				] }),
				jsx.jsx("p", { style: css.hint, children: props.hint })
			] });
		}
		/** Select field. */
		function SelectField(props) {
			return jsx.jsxs("div", { style: css.field, children: [
				jsx.jsxs("div", { style: css.head, children: [
					jsx.jsx("label", { style: css.label, htmlFor: props.id, children: props.label }),
					props.overridden ? jsx.jsxs("span", { style: css.badges, children: [
						jsx.jsx("span", { style: css.badge, children: props.overriddenLabel }),
						jsx.jsx("button", { type: "button", style: css.reset, disabled: props.disabled, onClick: props.onReset, children: props.resetLabel })
					] }) : null
				] }),
				jsx.jsx("select", { id: props.id, style: css.select, value: props.text, disabled: props.disabled, onChange: (event) => props.onEdit(event.target.value), children: props.options.map((option) => jsx.jsx("option", { value: option.value, children: option.label }, option.value)) }),
				jsx.jsx("p", { style: css.hint, children: props.hint })
			] });
		}
		/**
		* Render the auto-continue settings card.
		* @param props - locale copy, the card snapshot hook, and its form actions.
		* @returns the card.
		*/
		function AutocontinueCard(props) {
			const { t } = props;
			const state = props.useAutocontinue((snapshot) => snapshot);
			const [open, setOpen] = react.useState(false);
			const disabled = !state.writable;
			const value = state.value ?? {};
			const user = state.user ?? void 0;
			const isOverridden = (field) => user !== void 0 && Object.hasOwn(user, field);
			const invalid = state.dirty && (state.invalidMaxRetries || state.invalidDelayMs);
			return jsx.jsxs("li", { style: css.card, children: [
				jsx.jsx("button", { type: "button", style: css.header, "aria-expanded": open, onClick: () => setOpen((v) => !v), children: [
					jsx.jsxs("span", { style: css.headText, children: [
						jsx.jsx("span", { style: css.name, children: t("title") }),
						jsx.jsx("span", { style: css.description, children: t("description") })
					] }),
					state.dirty ? jsx.jsx("span", { style: css.pending, children: t("unsaved") }) : null,
					jsx.jsx("span", { style: open ? { ...css.chevron, ...css.chevronOpen } : css.chevron, children: "▾" })
				] }),
				open ? jsx.jsxs("div", { style: css.body, children: [
					disabled ? jsx.jsx("p", { style: css.hint, children: t("readOnly") }) : null,
					jsx.jsx(BooleanField, { id: "autocontinue-enabled", label: t("enabled"), hint: t("enabledHint"), checked: value.enabled ?? true, overridden: isOverridden("enabled"), disabled, overriddenLabel: t("overridden"), resetLabel: t("reset"), onEdit: (v) => props.edit("enabled", v), onReset: () => props.resetField("enabled") }),
					jsx.jsx(NumberField, { id: "autocontinue-max-retries", label: t("maxRetries"), hint: t("maxRetriesHint"), text: String(value.maxRetries ?? 3), invalid: state.invalidMaxRetries === true, overridden: isOverridden("maxRetries"), disabled, overriddenLabel: t("overridden"), resetLabel: t("reset"), invalidLabel: t("invalidNumber"), onEdit: (v) => props.edit("maxRetries", v), onReset: () => props.resetField("maxRetries") }),
					jsx.jsx(NumberField, { id: "autocontinue-delay-ms", label: t("delayMs"), hint: t("delayMsHint"), text: String(value.delayMs ?? 5000), invalid: state.invalidDelayMs === true, overridden: isOverridden("delayMs"), disabled, overriddenLabel: t("overridden"), resetLabel: t("reset"), invalidLabel: t("invalidNumber"), onEdit: (v) => props.edit("delayMs", v), onReset: () => props.resetField("delayMs") }),
					jsx.jsx(TextField, { id: "autocontinue-message", label: t("message"), hint: t("messageHint"), text: value.message ?? "请继续", overridden: isOverridden("message"), disabled, overriddenLabel: t("overridden"), resetLabel: t("reset"), invalidLabel: t("invalidNumber"), onEdit: (v) => props.edit("message", v), onReset: () => props.resetField("message") }),
					jsx.jsx(SelectField, { id: "autocontinue-scope", label: t("scope"), hint: t("scopeHint"), text: value.scope ?? "all", overridden: isOverridden("scope"), disabled, overriddenLabel: t("overridden"), resetLabel: t("reset"), options: [{ value: "all", label: t("scopeAll") }, { value: "roots", label: t("scopeRoots") }], onEdit: (v) => props.edit("scope", v), onReset: () => props.resetField("scope") }),
					jsx.jsxs("div", { style: css.footer, children: [
						invalid ? jsx.jsx("p", { style: css.failed, children: t("invalidNumber") }) : null,
						state.failed ? jsx.jsx("p", { style: css.failed, children: t("saveFailed") }) : null,
						state.dirty ? jsx.jsx("button", { type: "button", style: css.discard, disabled: disabled, onClick: props.discard, children: t("discard") }) : null,
						jsx.jsx("button", { type: "button", style: css.save, disabled: disabled || state.saving, onClick: props.save, children: state.saving ? t("saving") : t("save") })
					] })
				] }) : null
			] });
		}
		/**
		* Bridges the `autocontinue` scope onto the card's staged form. Kept small
		* and self-contained: drafts live in local React state, and save writes each
		* changed field through the bound settings scope (which revisions-fences the
		* writes against the Host).
		*/
		var AutocontinueCardController = class {
			scope;
			store;
			constructor(scope) {
				this.scope = scope;
				this.store = _deepseek_ai_dsh_client_runtime_client.createSnapshotStore({
					status: "loading",
					value: void 0,
					user: void 0,
					writable: false,
					dirty: false,
					saving: false,
					failed: false,
					invalidMaxRetries: false,
					invalidDelayMs: false
				});
				scope.subscribe(() => this.publish());
				this.publish();
			}
			publish() {
				const snapshot = this.scope.getSnapshot();
				this.store.set({
					status: snapshot.status,
					value: snapshot.value,
					user: snapshot.user,
					writable: snapshot.writable,
					dirty: this.drafts?.dirty ?? false,
					saving: this.saving ?? false,
					failed: this.failed ?? false,
					invalidMaxRetries: this.drafts?.invalidMaxRetries ?? false,
					invalidDelayMs: this.drafts?.invalidDelayMs ?? false
				});
			}
			/** Stage one field edit, validating numeric fields immediately. */
			edit(field, text) {
				this.drafts ??= { ...seedDrafts(this.scope.getSnapshot()) };
				const current = this.drafts;
				if (field === "enabled") current.enabled = text === true || text === "true";
				else current[field] = String(text);
				if (field === "maxRetries") current.invalidMaxRetries = parseNumber(String(text)) === void 0 && String(text).trim() !== "";
				if (field === "delayMs") current.invalidDelayMs = parseNumber(String(text)) === void 0 && String(text).trim() !== "";
				current.dirty = true;
				this.failed = false;
				this.publish();
			}
			/** Reset one field back to the schema default (clear the user override). */
			async resetField(field) {
				await this.scope.unset(field);
				this.drafts ??= {};
				delete this.drafts[field];
				if (field === "maxRetries") delete this.drafts.invalidMaxRetries;
				if (field === "delayMs") delete this.drafts.invalidDelayMs;
				this.publish();
			}
			/** Discard staged edits, keeping any Host-side values. */
			discard() {
				this.drafts = void 0;
				this.failed = false;
				this.publish();
			}
			/** Write every staged edit through the scope, then re-publish. */
			async save() {
				const drafts = this.drafts;
				if (drafts === void 0 || !drafts.dirty || this.saving) return;
				if (drafts.invalidMaxRetries || drafts.invalidDelayMs) return;
				this.saving = true;
				this.failed = false;
				this.publish();
				let landed = true;
				for (const field of ["enabled", "maxRetries", "delayMs", "message", "scope"]) {
					if (!Object.hasOwn(drafts, field)) continue;
					if (field === "enabled") {
						await this.scope.set(field, drafts[field] === true || drafts[field] === "true");
						continue;
					}
					const text = String(drafts[field]).trim();
					if (field === "maxRetries" || field === "delayMs") {
						if (text === "") {
							await this.scope.unset(field);
							continue;
						}
						const parsed = parseNumber(text);
						if (parsed === void 0) {
							landed = false;
							continue;
						}
						await this.scope.set(field, parsed);
						continue;
					}
					if (text === "") {
						await this.scope.unset(field);
						continue;
					}
					await this.scope.set(field, text);
				}
				if (landed) this.drafts = void 0;
				this.saving = false;
				this.failed = !landed;
				this.publish();
			}
			/** Build the face the card's slot registration injects. */
			inject() {
				return {
					hooks: { autocontinue: this.store },
					edit: (field, text) => this.edit(field, text),
					resetField: (field) => this.resetField(field),
					discard: () => this.discard(),
					save: () => this.save()
				};
			}
		};
		/**
		* Mount the plugin settings card.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "autocontinue: locale");
			const controller = new AutocontinueCardController(ctx.settingsScope.bind({ namespace: NS }));
			ctx.effect(() => ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register({
					name: "settings.plugin.item",
					key: NS,
					locale: NS,
					inject: () => controller.inject()
				}, AutocontinueCard);
			}), "autocontinue: settings card");
		}
		// #endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
