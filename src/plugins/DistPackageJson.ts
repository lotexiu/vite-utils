import path from "path";
import fs from "fs-extra";
import type { PluginOption } from "vite";
import { groupFilesByBase, loadRootPackage, ROOT_DIR } from "../utils.ts";

/**
 * @returns {import('vite').Plugin}
 */
export function distPackageJson(pkgName:string): PluginOption {
	let outDir: string;
	const ignoredFiles = new Set<string>();

	return {
		name: "update-package-json-exports",
		configResolved(conf) {
			outDir = conf.build.outDir;
		},

		generateBundle(_options, bundle) {
			for (const fileName in bundle) {
				const file = bundle[fileName];
				if (file.type === "chunk" && (file.facadeModuleId == null || !file.isEntry)) {
					ignoredFiles.add(fileName);
				}
				if (fileName.endsWith(".map")) {
					ignoredFiles.add(fileName);
				}
			}
		},

		async closeBundle() {
			const allFiles = fs
				.globSync(`${outDir}/**/*.*`)
				.map((f) => path.relative(outDir, f));
			const files = allFiles.filter((file) => !ignoredFiles.has(file));
			const groupedFiles: Record<
				string,
				Record<string, string>
			> = groupFilesByBase(files);
			const pkg = loadRootPackage();
			const previousExports = pkg.exports || {};
			pkg.name = pkgName;
			pkg.scripts = {};
			pkg.exports = {};
			Object.entries(groupedFiles).forEach(([base, variants]) => {
				const relativePath = function (file: string) {
					if (!file) return undefined;
					return `./${path.relative(outDir, path.join(outDir, file))}`;
				};
				pkg.exports[`./${base}`] = {
					import: {
						types: relativePath(
							variants["d.mts"] || variants["d.cts"] || variants["d.ts"],
						),
						default: relativePath(
							variants["mjs"] ||
								variants["cjs"] ||
								variants["js"] ||
								variants["json"] ||
								variants["wasm"],
						),
					},
					require: {
						types: relativePath(
							variants["d.cts"] || variants["d.ts"] || variants["d.mts"],
						),
						default: relativePath(
							variants["cjs"] ||
								variants["js"] ||
								variants["mjs"] ||
								variants["json"] ||
								variants["wasm"],
						),
					},
					style: relativePath(
						variants["css"] ||
							variants["scss"] ||
							variants["sass"] ||
							variants["less"] ||
							variants["styl"],
					),
					sass: relativePath(variants["scss"] || variants["sass"]),
					less: relativePath(variants["less"]),
				};
			});
			const [newPkg, prevPkg] = [
				JSON.stringify(pkg.exports, null, 2),
				JSON.stringify(previousExports, null, 2),
			];
			if (
				newPkg !== prevPkg &&
				[null, undefined, "", "{}"].includes(newPkg) === false
			) {
				fs.writeJSON(path.resolve(ROOT_DIR, outDir, "package.json"), pkg, { spaces: 2 });
			}
		},
	};
}
