import path from "path";
import fs from "fs-extra";
import type { PluginOption } from "vite";
import { groupFilesByBase, loadRootPackage, ROOT_DIR } from "../utils.ts";

/**
 * @returns {import('vite').Plugin}
 */
export function packageJsonPlugin(desiredOutDirs?: string[]): PluginOption {
	const ignoredFiles: string[] = []
	let compiledOutputPath: string;
	let outDirs: string[];

	return {
		name: "update-package-json-exports",
		configResolved(conf) {
			compiledOutputPath = conf.build.outDir;
			outDirs = desiredOutDirs || [compiledOutputPath];
		},

		generateBundle(_options, bundle) {
			for (const fileName in bundle) {
				const file = bundle[fileName];
				if (file.type === "chunk" && (file.facadeModuleId == null || !file.isEntry)) {
					ignoredFiles.push(fileName);
				}
				if (fileName.endsWith(".map")) {
					ignoredFiles.push(fileName);
				}
			}
		},

		async closeBundle() {
			const allFiles = fs
				.globSync(`${compiledOutputPath}/**/*.*`)
				.filter(f => !ignoredFiles.some(ignored => f.endsWith(ignored)));

			outDirs.forEach((outDir) => {
				const relativeFiles = allFiles.map((f) => path.relative(outDir, f));
				const groupedFiles = groupFilesByBase(relativeFiles, compiledOutputPath);
				const pkg = loadRootPackage();
				const previousExports = pkg.exports || {};
				if (outDir == compiledOutputPath) {
					delete pkg.scripts;
					delete pkg.devDependencies;
					pkg.private = false;
					pkg.publishConfig = {
						access: "public",
					};
					sanitizePackageDependencies(pkg);
				}
				generatePackageExports(pkg, groupedFiles, outDir);
				const [newPkg, prevPkg] = [
					JSON.stringify(pkg.exports, null, 2),
					JSON.stringify(previousExports, null, 2),
				];
				if (newPkg == prevPkg && ![null, undefined, "", "{}"].includes(newPkg) === false) {
					return;
				}
				fs.writeJSON(path.resolve(ROOT_DIR, outDir, "package.json"), pkg, { spaces: 2 });
			})
		},
	};
}

function sanitizePackageDependencies(pkg: Record<string, any>) {
	Object.entries((pkg.dependencies || {}) as Record<string, string>).forEach(([key, value]) => {
		const deleteDependecies = [
			"file:",
			"link:",
			"workspace:",
		];
		if (deleteDependecies.some((dep) => value.startsWith(dep))) {
			delete pkg.dependencies[key];
		}
	});
}

function generatePackageExports(pkg: Record<string, any>, groupedFiles: Record<string, Record<string, string>>, outDir: string) {
	pkg.exports = {
		"./package.json": {
			default: "./package.json",
		},
		".": {
			types: "./index.d.ts",
			import: "./index.js",
			default: "./index.js",
		}
	};
	pkg.sideEffects = false;
	pkg.typings = "./index.d.ts";
	pkg.module = "./index.js";
	pkg.main = "./index.js";
	pkg.type = "module";

	Object.entries(groupedFiles).forEach(([base, variants]) => {
		const getByOrder = function (keys: string[]) {
			for (const key of keys) {
				if (variants[key]) {
					return variants[key];
				}
			}
			return undefined;
		}
		const relativePath = function (extensions: string[]) {
			const file = getByOrder(extensions);
			if (!file) return undefined;
			return `./${path.relative(outDir, path.join(outDir, file))}`;
		};
		pkg.exports[`./${base}`] = {
			types: relativePath(["d.mts","d.cts","d.ts"]),
			import: relativePath(["mjs","js","cjs","json","wasm"]),
			default: relativePath(["js","cjs","mjs","json","wasm"]),
			style: relativePath(["css","scss","sass","less","styl",]),
			sass: relativePath(["scss", "sass"]),
			less: relativePath(["less"]),
		};
	});
}
