import path from "path";
import fs from "fs-extra";
import { log } from "console";
import chalk from "chalk";
import ora from "ora";
import ts from "typescript";

/*───────────────────────────────────────────────
│ Configurações globais
───────────────────────────────────────────────*/
export const ROOT_DIR = process.cwd();

/*───────────────────────────────────────────────
│ Log helpers
───────────────────────────────────────────────*/
export const logger = {
	info: (msg: string) => log(chalk.blue(msg)),
	success: (msg: string) => log(chalk.green(msg)),
	error: (msg: string) => log(chalk.red(msg)),
	warn: (msg: string) => log(chalk.yellow(msg)),
	step: (msg: string) => log(chalk.cyan(`→ ${msg}`)),
};

export type TLibrarySourceOptions = {
	ignoredDirs?: string[];
	ignoredPathPatterns?: Array<string | RegExp>;
	includeTypeOnlyFiles?: boolean;
	includeIndexFile?: boolean;
};

export type TLibrarySourceFile = {
	filePath: string;
	relativePath: string;
	importPath: string;
	valueExports: string[];
	isRequired: boolean;
};

function getModuleSymbol(
	checker: ts.TypeChecker,
	sourceFile: ts.SourceFile,
): ts.Symbol | undefined {
	return checker.getSymbolAtLocation(sourceFile);
}

function getAliasedSymbol(
	symbol: ts.Symbol,
	checker: ts.TypeChecker,
): ts.Symbol {
	if (!(symbol.flags & ts.SymbolFlags.Alias)) {
		return symbol;
	}

	try {
		return checker.getAliasedSymbol(symbol);
	} catch {
		return symbol;
	}
}

function getNodeChain(node: ts.Node): ts.Node[] {
	const chain = [node];
	let current = node.parent;

	while (current) {
		chain.push(current);
		current = current.parent;
	}

	return chain;
}

function hasJSDocTag(nodes: ts.Node[], tagName: string): boolean {
	return nodes.some(node => {
		return ts.getJSDocTags(node).some(tag => tag.tagName.text === tagName);
	});
}

function hasInternalJSDoc(nodes: ts.Node[]): boolean {
	return hasJSDocTag(nodes, "internal");
}

function hasRequiredJSDoc(nodes: ts.Node[]): boolean {
	return hasJSDocTag(nodes, "required");
}

function isInternalSymbol(
	symbol: ts.Symbol,
	checker: ts.TypeChecker,
	visited = new Set<ts.Symbol>(),
): boolean {
	if (visited.has(symbol)) {
		return false;
	}

	visited.add(symbol);

	if (hasInternalJSDoc((symbol.declarations ?? []).flatMap(getNodeChain))) {
		return true;
	}

	if (symbol.flags & ts.SymbolFlags.Alias) {
		const aliasedSymbol = getAliasedSymbol(symbol, checker);
		if (aliasedSymbol !== symbol) {
			return isInternalSymbol(aliasedSymbol, checker, visited);
		}
	}

	return false;
}

function isTypeOnlyExportDeclaration(declaration: ts.Declaration): boolean {
	if (ts.isExportSpecifier(declaration)) {
		return declaration.isTypeOnly || declaration.parent.parent.isTypeOnly;
	}

	if (ts.isExportDeclaration(declaration)) {
		return declaration.isTypeOnly;
	}

	return false;
}

function isTypeOnlyExport(
	symbol: ts.Symbol,
	resolvedSymbol: ts.Symbol,
): boolean {
	if ((symbol.declarations ?? []).some(isTypeOnlyExportDeclaration)) {
		return true;
	}

	return (resolvedSymbol.flags & ts.SymbolFlags.Value) === 0;
}

function getDeclarationStart(
	symbol: ts.Symbol,
	resolvedSymbol: ts.Symbol,
): number {
	const declarations = [
		...(symbol.declarations ?? []),
		...(resolvedSymbol.declarations ?? []),
	];

	if (declarations.length === 0) {
		return Number.MAX_SAFE_INTEGER;
	}

	return Math.min(...declarations.map(declaration => declaration.getStart()));
}

function collectFileValueExports(
	program: ts.Program,
	checker: ts.TypeChecker,
	filePath: string,
): string[] {
	const sourceFile = program.getSourceFile(filePath);
	if (!sourceFile) {
		return [];
	}

	const moduleSymbol = getModuleSymbol(checker, sourceFile);
	if (!moduleSymbol) {
		return [];
	}

	return checker
		.getExportsOfModule(moduleSymbol)
		.map(symbol => {
			const resolvedSymbol = getAliasedSymbol(symbol, checker);
			return {
				name: symbol.getName(),
				isInternal: isInternalSymbol(symbol, checker),
				isTypeOnly: isTypeOnlyExport(symbol, resolvedSymbol),
				declarationStart: getDeclarationStart(symbol, resolvedSymbol),
			};
		})
		.filter(symbol => {
			return symbol.name !== "__export" && !symbol.isInternal && !symbol.isTypeOnly;
		})
		.sort((left, right) => {
			if (left.declarationStart !== right.declarationStart) {
				return left.declarationStart - right.declarationStart;
			}

			return left.name.localeCompare(right.name);
		})
		.map(symbol => symbol.name);
}

function isRequiredFile(
	program: ts.Program,
	filePath: string,
): boolean {
	const sourceFile = program.getSourceFile(filePath);
	if (!sourceFile) {
		return false;
	}

	const nodes: ts.Node[] = [];
	const visit = (node: ts.Node) => {
		nodes.push(node);
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);

	return hasRequiredJSDoc(nodes);
}

export function shouldIgnoreLibraryFile(
	srcDir: string,
	filePath: string,
	options: TLibrarySourceOptions = {},
): boolean {
	const rootIndex = path.join(srcDir, "index.ts");
	const ignoredDirs = options.ignoredDirs ?? [];
	const ignoredPathPatterns = options.ignoredPathPatterns ?? [];

	if ((!options.includeIndexFile && filePath === rootIndex) || filePath.endsWith(".d.ts")) {
		return true;
	}

	const relativePath = path.relative(srcDir, filePath);
	const normalizedRelativePath = relativePath.replace(/\\/g, "/");
	const pathParts = relativePath.split(path.sep).filter(Boolean);
	const fileName = path.basename(filePath);

	if (ignoredPathPatterns.some((pattern) => {
		if (pattern instanceof RegExp) {
			return pattern.test(normalizedRelativePath);
		}

		return normalizedRelativePath.includes(pattern);
	})) {
		return true;
	}

	if (fileName.startsWith(".")) {
		return true;
	}

	return pathParts.some((part, index) => {
		const isDirectory = index < pathParts.length - 1;
		return isDirectory && (part.startsWith(".") || ignoredDirs.includes(part));
	});
}

export function getLibrarySourceFiles(
	srcDir: string,
	options: TLibrarySourceOptions = {},
): TLibrarySourceFile[] {
	const filePaths = fs
		.globSync(`${srcDir}/**/*.{tsx,ts,js}`)
		.filter(filePath => !shouldIgnoreLibraryFile(srcDir, filePath, options))
		.sort((left, right) => left.localeCompare(right));

	if (filePaths.length === 0) {
		return [];
	}

	const program = ts.createProgram(filePaths, {
		allowJs: true,
		checkJs: false,
		jsx: ts.JsxEmit.Preserve,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		skipLibCheck: true,
		target: ts.ScriptTarget.ESNext,
	});
	const checker = program.getTypeChecker();

	return filePaths
		.map((filePath) => {
			const relativePath = path
				.relative(srcDir, filePath)
				.replace(/\.[^/.]+$/, "")
				.replace(/\\/g, "/");
			const valueExports = collectFileValueExports(program, checker, filePath);
			const isRequired = isRequiredFile(program, filePath);

			return {
				filePath,
				relativePath,
				importPath: `./${relativePath}`,
				valueExports,
				isRequired,
			};
		})
		.filter((file) => {
			return options.includeTypeOnlyFiles || file.valueExports.length > 0 || file.isRequired;
		});
}

/*───────────────────────────────────────────────
│ Funções utilitárias
───────────────────────────────────────────────*/
export function getLibraryEntries<T extends boolean = false>(
	srcDir: string,
	list?: T,
	options: TLibrarySourceOptions = {},
): T extends true ? string[] : Record<string, string> {
	const files = getLibrarySourceFiles(srcDir, options);
	if (list === true) return files.map((file) => file.relativePath) as any;
	const entries: Record<string, string> = {};
	files.forEach((file) => {
		entries[file.relativePath] = file.filePath;
	});
	return entries as any;
}

export function extractTsconfigAliases() {
	const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
	if (!fs.existsSync(tsconfigPath)) return {};
	const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
	const paths: Record<string, string[]> = tsconfig.compilerOptions?.paths || {};
	const baseUrl = tsconfig.compilerOptions?.baseUrl || ".";
	const aliases: Record<string, string> = {};
	for (const [alias, targets] of Object.entries(paths)) {
		const key = alias.replace(/\/\*$/, "");
		const value = targets[0]?.replace(/\/\*$/, "");
		if (value) {
			aliases[key] = path.resolve(process.cwd(), baseUrl, value);
		}
	}
	return aliases;
}

export function loadRootPackage(): Record<string, any> {
	const spinner = ora("Lendo package.json raiz...").start();
	const pkgPath = path.join(ROOT_DIR, "package.json");

	if (!fs.existsSync(pkgPath)) {
		spinner.fail("package.json não encontrado.");
		process.exit(1);
	}

	try {
		const data = fs.readJSONSync(pkgPath, "utf-8");
		spinner.succeed("package.json carregado!");
		return data;
	} catch (e) {
		spinner.fail("Erro ao ler package.json");
		logger.error(String(e));
		process.exit(1);
	}
}

/**
 * Agrupa caminhos de arquivo por seu nome base, mapeando as extensões.
 * Ex: 'dist/global.d.ts.map' -> { 'dist/global': { 'd.ts.map': 'dist/global.d.ts.map' } }
 * @param filePaths Uma lista de caminhos de arquivo (strings).
 * @returns Um objeto onde as chaves são os caminhos base e os valores são objetos de mapeamento de extensão.
 */
export function groupFilesByBase(
	filePaths: string[],
	compiledOutputPath: string,
): Record<string, Record<string, string>> {
	type ArquivosAgrupados = {
		[caminhoBase: string]: {
			[extensao: string]: string;
		};
	};

	return filePaths.reduce((acc, caminhoCompleto) => {
		const ultimaBarraIndex = caminhoCompleto.lastIndexOf("/");
		const nomeArquivo =
			ultimaBarraIndex === -1
				? caminhoCompleto
				: caminhoCompleto.substring(ultimaBarraIndex + 1);

		const primeiroPontoNomeArquivoIndex = nomeArquivo.indexOf(".");

		// Caso de arquivo sem extensão (improvável no seu exemplo, mas robusto)
		if (primeiroPontoNomeArquivoIndex === -1) {
			const caminhoBase = path.relative(compiledOutputPath, caminhoCompleto);
			acc[caminhoBase] = { ...(acc[caminhoBase] || {}), "": caminhoCompleto };
			return acc;
		}

		const nomeBase = nomeArquivo.substring(0, primeiroPontoNomeArquivoIndex);
		const chaveDaExtensao = nomeArquivo.substring(
			primeiroPontoNomeArquivoIndex + 1,
		);
		const diretorio =
			ultimaBarraIndex === -1
				? ""
				: caminhoCompleto.substring(0, ultimaBarraIndex + 1);

		const baseParaAgrupamento = diretorio.startsWith(compiledOutputPath)
			? path.relative(compiledOutputPath, path.join(diretorio, nomeBase))
			: path.join(diretorio, nomeBase);

		acc[baseParaAgrupamento] = {
			...(acc[baseParaAgrupamento] || {}),
			[chaveDaExtensao]: caminhoCompleto,
		};

		return acc;
	}, {} as ArquivosAgrupados);
}

export function externalDependencies(): any {
	const { peerDependencies = {}, dependencies = {} } = loadRootPackage();
	const pkgs = [...Object.keys(peerDependencies), ...Object.keys(dependencies)];
	return (id: string) => {
		if (pkgs.some((pkg) => id === pkg || id.startsWith(`${pkg}/`))) return true;
		return false;
	};
}
