import { defineConfig } from "vite";
import { betterOutDirCleanPlugin } from "../src/plugins/BetterOutDirClean";
import { copyAllSASSPlugin } from "../src/plugins/CopyAllSASS";
import { excludeSASSPProcessPlugin } from "../src/plugins/ExcludeSASSPProcess";
import { packageJsonPlugin } from "../src/plugins/PackageJsonPlugin";

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

		// 4. Gera package.json ou atualiza exports com base nos arquivos gerados nos caminhos especificados
		packageJsonPlugin(['dist', './']),
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
