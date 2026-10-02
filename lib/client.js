// dsh-hirame client half: no UI. Memory lives in plain md files the user
// opens in any editor.
//
// dsh loads client entries as classic scripts through window.__ModuleLoader__
// (NOT as ESM — top-level import/export here is a SyntaxError that poisons
// the combined client script and blocks web boot). The module below mirrors
// the shape of working plugins (dsh-taskboard): a CJS-flavored factory that
// exports { name, inject, apply } and returns module.exports.
//
// The window flag makes registration idempotent: if the host executes this
// bundle more than once (e.g. the plugin is reachable under two names during
// identity migrations), the duplicate registration is skipped instead of
// throwing "duplicate factory registration" and blocking web boot.
if (!window.__dshHirameClientRegistered) {
	window.__dshHirameClientRegistered = true;
	window.__ModuleLoader__.load({
		id: "dsh-hirame",
		factory: (require) => {
			var module = { exports: {} };
			var exports = module.exports;
			Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
			exports.name = "dsh-hirame/client";
			exports.inject = [];
			exports.apply = function apply() {
				// intentionally empty: the host half (lib/index.js) does all the work
			};
			return module.exports;
		},
	});
}
