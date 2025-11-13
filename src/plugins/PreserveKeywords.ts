import type { PluginOption } from "vite";
import fs from "fs-extra";
import path from "path";
import * as ts from "typescript";

/**
 * Keywords TypeScript que podem ser perdidas durante a geração de arquivos .d.ts
 */
const KEYWORDS_TO_PRESERVE = [
	"abstract",
	"readonly",
	"private",
	"protected",
	"public",
	"static",
	"async",
	"override",
] as const;

type KeywordInfo = {
	keyword: string;
	line: number;
	column: number;
	memberName: string;
	kind: string; // 'method', 'property', 'class', etc.
};

/**
 * Extrai keywords de um arquivo TypeScript
 */
function extractKeywords(sourceFile: ts.SourceFile): Map<string, KeywordInfo[]> {
	const keywordsMap = new Map<string, KeywordInfo[]>();

	function processClass(node: ts.ClassDeclaration | ts.ClassExpression, parentContext?: string) {
		// Para classes anônimas ou dentro de funções, usar contexto do pai
		const className = node.name?.text || parentContext || 'AnonymousClass';
		const classKeywords: KeywordInfo[] = [];

		// Verificar se a classe é abstract
		const classModifiers = ts.canHaveModifiers(node)
			? ts.getModifiers(node)
			: undefined;
		if (
			classModifiers?.some(
				(m) => m.kind === ts.SyntaxKind.AbstractKeyword,
			)
		) {
			const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
			classKeywords.push({
				keyword: "abstract",
				line: pos.line,
				column: pos.character,
				memberName: className,
				kind: "class",
			});
		}

		keywordsMap.set(className, classKeywords);

		// Processar membros da classe
		node.members.forEach((member) => {
			let memberName: string | undefined;
			const memberKeywords: KeywordInfo[] = [];

			if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
				memberName = member.name.text;
			} else if (
				ts.isPropertyDeclaration(member) &&
				ts.isIdentifier(member.name)
			) {
				memberName = member.name.text;
			} else if (
				ts.isGetAccessor(member) &&
				ts.isIdentifier(member.name)
			) {
				memberName = `get ${member.name.text}`;
			} else if (
				ts.isSetAccessor(member) &&
				ts.isIdentifier(member.name)
			) {
				memberName = `set ${member.name.text}`;
			}

			if (!memberName) {
				return;
			}

			const pos = sourceFile.getLineAndCharacterOfPosition(
				member.getStart(),
			);
			const kind = ts.isMethodDeclaration(member) ? "method" : "property";

			// Verificar modifiers
			const modifiers = ts.canHaveModifiers(member)
				? ts.getModifiers(member)
				: undefined;
			modifiers?.forEach((modifier: ts.Modifier) => {
				const keyword = getKeywordFromModifier(modifier);
				if (keyword) {
					memberKeywords.push({
						keyword,
						line: pos.line,
						column: pos.character,
						memberName,
						kind,
					});
				}
			});

			if (memberKeywords.length > 0) {
				const key = `${className}.${memberName}`;
				keywordsMap.set(key, memberKeywords);
			}
		});
	}

	function visit(node: ts.Node, parentContext?: string) {
		// Processar classes declaradas
		if (ts.isClassDeclaration(node)) {
			processClass(node, parentContext);
		}

		// Processar classes como expressões (dentro de funções, etc)
		if (ts.isClassExpression(node)) {
			processClass(node, parentContext);
		}

		// Se for uma função, passar o nome como contexto para classes internas
		if (ts.isFunctionDeclaration(node) && node.name) {
			const fnName = node.name.text;
			ts.forEachChild(node, (child) => visit(child, fnName));
			return;
		}

		// Se for uma função, passar o nome como contexto para classes internas
		if (ts.isFunctionDeclaration(node) && node.name) {
			const fnName = node.name.text;
			ts.forEachChild(node, (child) => visit(child, fnName));
			return;
		}

		// Processar interfaces
		if (ts.isInterfaceDeclaration(node) && node.name) {
			const interfaceName = node.name.text;
			node.members.forEach((member) => {
				let memberName: string | undefined;
				const memberKeywords: KeywordInfo[] = [];

				if (
					ts.isPropertySignature(member) &&
					ts.isIdentifier(member.name)
				) {
					memberName = member.name.text;
				} else if (
					ts.isMethodSignature(member) &&
					ts.isIdentifier(member.name)
				) {
					memberName = member.name.text;
				}

				if (!memberName) {
					return;
				}

				const pos = sourceFile.getLineAndCharacterOfPosition(
					member.getStart(),
				);

				// Verificar readonly em interfaces
				const modifiers = ts.canHaveModifiers(member)
					? ts.getModifiers(member)
					: undefined;
				modifiers?.forEach((modifier: ts.Modifier) => {
					if (modifier.kind === ts.SyntaxKind.ReadonlyKeyword) {
						memberKeywords.push({
							keyword: "readonly",
							line: pos.line,
							column: pos.character,
							memberName,
							kind: "property",
						});
					}
				});

				if (memberKeywords.length > 0) {
					const key = `${interfaceName}.${memberName}`;
					keywordsMap.set(key, memberKeywords);
				}
			});
		}

		ts.forEachChild(node, (child) => visit(child, parentContext));
	}

	visit(sourceFile);
	return keywordsMap;
}

/**
 * Converte um modifier TypeScript em keyword string
 */
function getKeywordFromModifier(modifier: ts.Modifier): string | null {
	switch (modifier.kind) {
		case ts.SyntaxKind.AbstractKeyword:
			return "abstract";
		case ts.SyntaxKind.ReadonlyKeyword:
			return "readonly";
		case ts.SyntaxKind.PrivateKeyword:
			return "private";
		case ts.SyntaxKind.ProtectedKeyword:
			return "protected";
		case ts.SyntaxKind.PublicKeyword:
			return "public";
		case ts.SyntaxKind.StaticKeyword:
			return "static";
		case ts.SyntaxKind.AsyncKeyword:
			return "async";
		case ts.SyntaxKind.OverrideKeyword:
			return "override";
		default:
			return null;
	}
}

/**
 * Adiciona keywords ausentes usando busca por padrão de texto (para membros em tipos de retorno)
 */
function restoreKeywordsByPattern(
	dtsContent: string,
	originalKeywords: Map<string, KeywordInfo[]>,
	debug: boolean = false,
): string {
	let modifiedContent = dtsContent;
	const modifications: Array<{ offset: number; keyword: string; memberName: string }> = [];

	originalKeywords.forEach((keywords, key) => {
		// Separar nome da classe e do membro
		const parts = key.split('.');
		if (parts.length !== 2) return; // Ignorar classes sem membro

		const [_className, memberName] = parts;

		keywords.forEach((keywordInfo) => {
			// Procurar o padrão do membro no .d.ts
			// Ex: "render(): ReactNode" ou "render(): Promise<ReactNode>"
			const memberPattern = new RegExp(
				`(\\s+)(${memberName}\\s*\\([^)]*\\)\\s*:)`,
				'g'
			);

			let match;
			while ((match = memberPattern.exec(modifiedContent)) !== null) {
				const indent = match[1];
				const memberSignature = match[2];
				const insertPos = match.index + indent.length;

				// Verificar se a keyword já está presente antes do membro
				const beforeMember = modifiedContent.slice(Math.max(0, insertPos - 50), insertPos);
				const keywordRegex = new RegExp(`\\b${keywordInfo.keyword}\\b`);

				if (!keywordRegex.test(beforeMember)) {
					if (debug) {
						console.log(`[PreserveKeywords]   ✓ Encontrado padrão para '${memberName}', inserindo '${keywordInfo.keyword}'`);
					}
					modifications.push({
						offset: insertPos,
						keyword: keywordInfo.keyword,
						memberName,
					});
				}
			}
		});
	});

	// Aplicar modificações (de trás para frente)
	modifications.sort((a, b) => b.offset - a.offset);

	modifications.forEach((mod) => {
		modifiedContent =
			modifiedContent.slice(0, mod.offset) +
			`${mod.keyword} ` +
			modifiedContent.slice(mod.offset);
	});

	return modifiedContent;
}

/**
 * Adiciona keywords ausentes em um arquivo .d.ts
 */
function restoreKeywords(
	dtsContent: string,
	originalKeywords: Map<string, KeywordInfo[]>,
	debug: boolean = false,
): string {
	const sourceFile = ts.createSourceFile(
		"temp.d.ts",
		dtsContent,
		ts.ScriptTarget.Latest,
		true,
	);

	const dtsKeywords = extractKeywords(sourceFile);
	const modifications: Array<{ position: number; keyword: string; key: string }> = [];

	if (debug) {
		console.log(`[PreserveKeywords]   Keywords no .d.ts:`);
		dtsKeywords.forEach((keywords, key) => {
			const keywordList = keywords.map(k => k.keyword).join(', ');
			console.log(`[PreserveKeywords]     ${key}: ${keywordList || '(nenhuma)'}`);
		});
	}

	// Comparar keywords
	originalKeywords.forEach((keywords, key) => {
		const dtsKeys = dtsKeywords.get(key) || [];
		const dtsKeywordSet = new Set(dtsKeys.map((k) => k.keyword));

		keywords.forEach((keywordInfo) => {
			if (!dtsKeywordSet.has(keywordInfo.keyword)) {
				// Keyword está faltando no .d.ts
				if (debug) {
					console.log(`[PreserveKeywords]   🔍 Faltando keyword '${keywordInfo.keyword}' em '${key}'`);
				}
				// Encontrar a posição onde adicionar
				const position = findInsertPosition(
					sourceFile,
					dtsContent,
					key,
					keywordInfo,
				);
				if (position !== -1) {
					if (debug) {
						console.log(`[PreserveKeywords]   ✓ Posição encontrada: ${position}`);
					}
					modifications.push({
						position,
						keyword: keywordInfo.keyword,
						key,
					});
				} else if (debug) {
					console.log(`[PreserveKeywords]   ✗ Posição não encontrada para '${key}'`);
				}
			}
		});
	});

	// Aplicar modificações (de trás para frente para não alterar posições)
	modifications.sort((a, b) => b.position - a.position);

	let modifiedContent = dtsContent;
	modifications.forEach((mod) => {
		if (debug) {
			console.log(`[PreserveKeywords]   Inserindo '${mod.keyword}' na posição ${mod.position} para '${mod.key}'`);
		}
		modifiedContent =
			modifiedContent.slice(0, mod.position) +
			mod.keyword +
			" " +
			modifiedContent.slice(mod.position);
	});

	// Tentar abordagem baseada em padrão de texto para keywords não aplicadas
	if (modifications.length < countMissingKeywords(originalKeywords, dtsKeywords)) {
		if (debug) {
			console.log(`[PreserveKeywords]   Tentando abordagem baseada em padrão de texto...`);
		}
		modifiedContent = restoreKeywordsByPattern(modifiedContent, originalKeywords, debug);
	}

	return modifiedContent;
}

/**
 * Conta quantas keywords estão faltando
 */
function countMissingKeywords(
	originalKeywords: Map<string, KeywordInfo[]>,
	dtsKeywords: Map<string, KeywordInfo[]>,
): number {
	let count = 0;
	originalKeywords.forEach((keywords, key) => {
		const dtsKeys = dtsKeywords.get(key) || [];
		const dtsKeywordSet = new Set(dtsKeys.map((k) => k.keyword));
		keywords.forEach((keywordInfo) => {
			if (!dtsKeywordSet.has(keywordInfo.keyword)) {
				count++;
			}
		});
	});
	return count;
}

/**
 * Encontra a posição onde inserir a keyword no arquivo .d.ts
 */
function findInsertPosition(
	sourceFile: ts.SourceFile,
	content: string,
	key: string,
	keywordInfo: KeywordInfo,
): number {
	const [className, memberName] = key.includes(".")
		? key.split(".")
		: [key, null];

	let targetNode: ts.Node | undefined;

	function visit(node: ts.Node) {
		if (keywordInfo.kind === "class" && ts.isClassDeclaration(node)) {
			if (node.name?.text === className) {
				targetNode = node;
			}
		} else if (
			ts.isClassDeclaration(node) &&
			node.name?.text === className &&
			memberName
		) {
			node.members.forEach((member) => {
				let name: string | undefined;

				if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
					name = member.name.text;
				} else if (
					ts.isPropertyDeclaration(member) &&
					ts.isIdentifier(member.name)
				) {
					name = member.name.text;
				}

				if (name === memberName) {
					targetNode = member;
				}
			});
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	if (!targetNode) {
		return -1;
	}

	// Encontrar o início da declaração (após comentários e antes de qualquer modifier)
	const start = targetNode.getStart(sourceFile);
	const fullStart = targetNode.getFullStart();

	// Obter o texto completo para verificar se já tem outros modifiers
	const text = content.slice(fullStart, start);
	const lines = text.split("\n");
	const lastLine = lines[lines.length - 1];

	// Se já existem modifiers na última linha, inserir antes deles
	// Senão, inserir no início da declaração
	const modifierMatch = lastLine.match(
		/\s*(export|declare|public|private|protected|static|readonly|async|abstract|override)\s/,
	);

	if (modifierMatch && modifierMatch.index !== undefined) {
		return fullStart + text.lastIndexOf(lastLine) + modifierMatch.index;
	}

	return start;
}

/**
 * Coleta todos os arquivos .ts/.tsx recursivamente de um diretório
 */
function collectSourceFiles(dir: string): string[] {
	const files: string[] = [];

	function walk(currentDir: string) {
		if (!fs.existsSync(currentDir)) {
			return;
		}

		const entries = fs.readdirSync(currentDir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(currentDir, entry.name);

			if (entry.isDirectory()) {
				// Ignorar node_modules e outras pastas comuns
				if (!["node_modules", ".git", "dist", "build"].includes(entry.name)) {
					walk(fullPath);
				}
			} else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
				files.push(fullPath);
			}
		}
	}

	walk(dir);
	return files;
}

/**
 * Mapeia arquivo .d.ts para seu arquivo fonte original baseado em nome e estrutura
 */
function findSourceFileForDts(dtsPath: string, sourceFiles: string[], outDir: string, rootDir: string): string | null {
	const dtsRelative = path.relative(outDir, dtsPath);
	const baseName = path.basename(dtsPath, ".d.ts");
	const dtsDir = path.dirname(dtsRelative);

	// Tentar encontrar arquivo com o mesmo nome relativo
	for (const sourceFile of sourceFiles) {
		const sourceRelative = path.relative(rootDir, sourceFile);
		const sourceBaseName = path.basename(sourceFile, path.extname(sourceFile));
		const sourceDir = path.dirname(sourceRelative);

		// Verificar se o nome base coincide
		if (sourceBaseName === baseName) {
			// Verificar se a estrutura de diretórios coincide (removendo "src" do caminho)
			const normalizedSourceDir = sourceDir.replace(/^src[\/\\]?/, "");
			const normalizedDtsDir = dtsDir;

			if (normalizedSourceDir === normalizedDtsDir) {
				return sourceFile;
			}
		}
	}

	// Fallback: procurar apenas pelo nome do arquivo
	for (const sourceFile of sourceFiles) {
		const sourceBaseName = path.basename(sourceFile, path.extname(sourceFile));
		if (sourceBaseName === baseName) {
			return sourceFile;
		}
	}

	return null;
}

export function preserveKeywordsPlugin(options?: {
	srcDir?: string;
	enabled?: boolean;
	debug?: boolean;
}): PluginOption {
	const { srcDir = "src", enabled = true, debug = false } = options || {};
	let outDir: string;
	let rootDir: string;
	let sourceFiles: string[] = [];

	return {
		name: "preserve-keywords",

		configResolved(config) {
			rootDir = config.root;
			outDir = path.resolve(config.root, config.build.outDir || "dist");

			// Coletar arquivos fonte do srcDir
			const srcPath = path.resolve(rootDir, srcDir);
			sourceFiles = collectSourceFiles(srcPath);

			if (debug) {
				console.log(`[PreserveKeywords] Encontrados ${sourceFiles.length} arquivo(s) fonte em ${srcPath}`);

				// Debug: mostrar alguns arquivos encontrados
				if (sourceFiles.length > 0) {
					console.log(`[PreserveKeywords] Exemplos de arquivos fonte:`);
					sourceFiles.slice(0, 5).forEach(file => {
						console.log(`  - ${path.relative(rootDir, file)}`);
					});
					if (sourceFiles.length > 5) {
						console.log(`  ... e mais ${sourceFiles.length - 5} arquivo(s)`);
					}
				}
			}
		},		async closeBundle() {
			if (!enabled) {
				return;
			}

			if (sourceFiles.length === 0) {
				console.warn(`[PreserveKeywords] Nenhum arquivo fonte encontrado. Verifique o srcDir: ${srcDir}`);
				return;
			}

			const dtsFiles = fs.globSync(`${outDir}/**/*.d.ts`);
			if (debug) {
				console.log(`[PreserveKeywords] Encontrados ${dtsFiles.length} arquivo(s) .d.ts em ${outDir}`);
			}

			let processedCount = 0;
			let modifiedCount = 0;
			let notFoundCount = 0;

			for (const dtsFile of dtsFiles) {
				const sourcePath = findSourceFileForDts(dtsFile, sourceFiles, outDir, path.resolve(rootDir, srcDir));

				if (!sourcePath || !fs.existsSync(sourcePath)) {
					notFoundCount++;
					if (debug) {
						console.warn(`[PreserveKeywords] Arquivo fonte não encontrado para: ${path.relative(outDir, dtsFile)}`);
					}
					continue;
				}

				try {
					if (debug) {
						console.log(`[PreserveKeywords] Processando: ${path.relative(rootDir, sourcePath)} -> ${path.relative(outDir, dtsFile)}`);
					}

					// Ler arquivos
					const sourceContent = fs.readFileSync(sourcePath, "utf-8");
					const dtsContent = fs.readFileSync(dtsFile, "utf-8");

					// Extrair keywords do arquivo original
					const sourceFile = ts.createSourceFile(
						sourcePath,
						sourceContent,
						ts.ScriptTarget.Latest,
						true,
					);
					const originalKeywords = extractKeywords(sourceFile);

					// Debug: mostrar keywords encontradas
					if (debug && originalKeywords.size > 0) {
						console.log(`[PreserveKeywords]   Keywords encontradas no fonte:`);
						originalKeywords.forEach((keywords, key) => {
							const keywordList = keywords.map(k => k.keyword).join(', ');
							console.log(`[PreserveKeywords]     ${key}: ${keywordList}`);
						});
					}

					// Restaurar keywords no .d.ts
					const modifiedContent = restoreKeywords(
						dtsContent,
						originalKeywords,
						debug, // passar flag de debug
					);

					// Salvar se houver mudanças
					if (modifiedContent !== dtsContent) {
						fs.writeFileSync(dtsFile, modifiedContent, "utf-8");
						modifiedCount++;
						if (debug) {
							console.log(`[PreserveKeywords] ✓ Modificado: ${path.relative(outDir, dtsFile)}`);
						}
					}

					processedCount++;
				} catch (error) {
					console.warn(
						`[PreserveKeywords] Erro ao processar ${dtsFile}:`,
						error,
					);
				}
			}

			if (processedCount > 0 || debug) {
				console.log(`[PreserveKeywords] ${processedCount} processado(s), ${modifiedCount} modificado(s)${notFoundCount > 0 ? `, ${notFoundCount} sem correspondência` : ''}`);
			}
		},
	};
}
