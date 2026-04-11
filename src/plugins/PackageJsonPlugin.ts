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
			const discoveredFiles = fs.globSync(`${compiledOutputPath}/**/*.*`);
			const exportedFiles = discoveredFiles.filter(f => {
				return !ignoredFiles.some(ignored => f.endsWith(ignored));
			});

			outDirs.forEach((outDir) => {
				const relativeDiscoveredFiles = discoveredFiles.map((f) => path.relative(outDir, f));
				const relativeExportedFiles = exportedFiles.map((f) => path.relative(outDir, f));
				const groupedAllFiles = groupFilesByBase(relativeDiscoveredFiles, compiledOutputPath);
				const groupedFiles = groupFilesByBase(relativeExportedFiles, compiledOutputPath);
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
				generatePackageExports(pkg, groupedFiles, groupedAllFiles, outDir);
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

function hasRuntimeVariant(variants?: Record<string, string>) {
	if (!variants) {
		return false;
	}

	return ["js", "mjs", "cjs", "json", "wasm"].some((extension) => {
		return Boolean(variants[extension]);
	});
}

function compactExportEntry(entry: Record<string, string | undefined>) {
	return Object.fromEntries(
		Object.entries(entry).filter(([, value]) => value != null),
	);
}

function generatePackageExports(
	pkg: Record<string, any>,
	groupedFiles: Record<string, Record<string, string>>,
	groupedAllFiles: Record<string, Record<string, string>>,
	outDir: string,
) {
	delete pkg.exports;
	pkg.sideEffects = true;
	pkg.type = "module";

	if (groupedFiles["index"]) {
		const {
			js, mjs, cjs,
			"d.ts":dts,
			"d.mts":dmts,
			"d.cts":dcts,
		} = groupedFiles["index"];

		pkg.typings = dmts || dcts || dts || undefined;
		pkg.module = mjs || js || cjs || undefined;
		pkg.main = cjs || js || mjs || undefined;
		pkg.exports = {
			".": compactExportEntry({
				types: `./${path.relative(outDir, path.join(outDir, dmts || dcts || dts))}`,
				import: `./${path.relative(outDir, path.join(outDir, mjs || js || cjs))}`,
				require: `./${path.relative(outDir, path.join(outDir, cjs || js || mjs))}`,
				default: `./${path.relative(outDir, path.join(outDir, js || cjs || mjs))}`,
			}),
		}
		delete groupedFiles["index"];
		delete groupedAllFiles["index"];
	}	else {
		pkg.exports = { };
	}
	pkg.exports["./package.json"] = {
		default: "./package.json",
	}

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
		const exportEntry = compactExportEntry({
			types: relativePath(["d.mts","d.cts","d.ts"]),
			import: relativePath(["mjs","js","cjs","json","wasm"]),
			require: relativePath(["cjs","js","mjs","json","wasm"]),
			default: relativePath(["js","cjs","mjs","json","wasm"]),
			style: relativePath(["css","scss","sass","less","styl",]),
			sass: relativePath(["scss", "sass"]),
			less: relativePath(["less"]),
		});
		const runtimeWasBuilt = hasRuntimeVariant(groupedAllFiles[base]);
		const runtimeIsExported = hasRuntimeVariant(variants);

		if (!runtimeIsExported && runtimeWasBuilt) {
			return;
		}

		if (Object.keys(exportEntry).length === 0) {
			return;
		}

		pkg.exports[`./${base}`] = exportEntry;
	});
}
