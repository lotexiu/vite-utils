import { defineConfig } from "vite";
import { betterOutDirCleanPlugin } from "../src/plugins/BetterOutDirClean";
import { copyAllSASSPlugin } from "../src/plugins/CopyAllSASS";
import { excludeSASSPProcessPlugin } from "../src/plugins/ExcludeSASSPProcess";
import { updatePackageJsonPlugin } from "../src/plugins/MainPackage";
import { preserveKeywordsPlugin } from "../src/plugins/PreserveKeywords";

/**
 * Exemplo de configuração Vite com todos os plugins @lotexiu/vite-utils
 *
 * Esta configuração é ideal para bibliotecas TypeScript no monorepo aleph-typescript
 */
export default defineConfig({
	plugins: [
		// 1. Limpa arquivos órfãos do build anterior
		betterOutDirCleanPlugin(),

		// 2. Copia arquivos SASS para dist sem processá-los
		copyAllSASSPlugin("src"),

		// 3. Exclui SASS do processamento normal do Vite
		excludeSASSPProcessPlugin("src"),

		// 4. Gera package.json otimizado para o build
		updatePackageJsonPlugin(),

		// 5. Preserva keywords TypeScript em arquivos .d.ts
		preserveKeywordsPlugin({
			srcDir: "src",
			enabled: true,
		}),
	],

	build: {
		lib: {
			entry: "./src/index.ts",
			formats: ["es"],
			fileName: (format) => `index.${format === "es" ? "mjs" : "js"}`,
		},
		rollupOptions: {
			external: [
				"react",
				"react-dom",
				"react/jsx-runtime",
				// Adicione outras dependências externas aqui
			],
			output: {
				preserveModules: true, // Preserva estrutura de módulos
				preserveModulesRoot: "src",
				entryFileNames: "[name].mjs",
			},
		},
		outDir: "dist",
		emptyOutDir: false, // betterOutDirCleanPlugin faz isso de forma inteligente
		sourcemap: true,
	},
});
