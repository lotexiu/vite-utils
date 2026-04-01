import type { PluginOption } from "vite";

/**
 * Remove chunks vazios do bundle (ex: arquivos `types.ts` que só exportam tipos TypeScript).
 *
 * Arquivos que geram apenas declarações de tipo não produzem código JS/CJS em runtime.
 * Para ESM o chunk fica vazio, mas no CJS o Rollup insere boilerplate `'use strict'`
 * mesmo sem exports. Por isso a verificação correta é `chunk.exports.length === 0`.
 * Os `.d.ts` correspondentes continuam sendo gerados normalmente pelo `vite-plugin-dts`.
 */
export function excludeEmptyChunksPlugin(): PluginOption {
	return {
		name: "exclude-empty-chunks-plugin",
		generateBundle(_, bundle) {
			for (const [name, chunk] of Object.entries(bundle)) {
				if (chunk.type != 'chunk') continue;
				const isEmptyChunk = chunk.code.trim().length == 0 || chunk.code.trim() == '"use strict";'
				if (!isEmptyChunk) continue;
				delete bundle[name];
			}
		},
	};
}
