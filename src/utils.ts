import path from "path";
import fs from "fs-extra";
import { log } from "console";
import chalk from "chalk";
import ora from "ora";

/*───────────────────────────────────────────────
│ Configurações globais
───────────────────────────────────────────────*/
export const ROOT_DIR = process.cwd();

/*───────────────────────────────────────────────
│ Padrões de importação
───────────────────────────────────────────────*/
export const importPatterns: Record<string, RegExp[]> = {
	script: [/(?:import.*from\s+['"]([^'"]+)['"])|(?:require\(['"]([^'"]+)['"]\))/g],
	style: [/@import\s+['"]([^'"]+)['"]/g, /@use\s+['"]([^'"]+)['"]/g],
};

export const formatGroups: Record<string, string> = {
	ts: "script",
	tsx: "script",
	js: "script",
	jsx: "script",
	sass: "style",
	scss: "style",
	css: "style",
};

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


/*───────────────────────────────────────────────
│ Funções utilitárias
───────────────────────────────────────────────*/
export function getLibraryEntries(srcDir: string) {
  const files = fs.globSync(['**/*.{tsx,ts,js}', '!**/*.d.ts'], {
    cwd: srcDir,
  });
  const entries: Record<string, string> = {};
  files.forEach(file => {
    const entryName = file.replace(/\.(ts|js)x?$/, '');
    entries[entryName] = path.resolve(srcDir, file);
  });

  return entries;
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

export function buildPackageName(author: string, folder: string) {
	return `@${author}/${folder}`;
}

/**
 * Agrupa caminhos de arquivo por seu nome base, mapeando as extensões.
 * Ex: 'dist/global.d.ts.map' -> { 'dist/global': { 'd.ts.map': 'dist/global.d.ts.map' } }
 * @param filePaths Uma lista de caminhos de arquivo (strings).
 * @returns Um objeto onde as chaves são os caminhos base e os valores são objetos de mapeamento de extensão.
 */
export function groupFilesByBase(filePaths: string[]): Record<string, Record<string, string>> {
  type ArquivosAgrupados = {
    [caminhoBase: string]: {
      [extensao: string]: string;
    };
  };

  return filePaths.reduce((acc, caminhoCompleto) => {
    const ultimaBarraIndex = caminhoCompleto.lastIndexOf('/');
    const nomeArquivo = ultimaBarraIndex === -1 
      ? caminhoCompleto 
      : caminhoCompleto.substring(ultimaBarraIndex + 1);

    const primeiroPontoNomeArquivoIndex = nomeArquivo.indexOf('.');

    // Caso de arquivo sem extensão (improvável no seu exemplo, mas robusto)
    if (primeiroPontoNomeArquivoIndex === -1) {
      const caminhoBase = caminhoCompleto;
      acc[caminhoBase] = { ...(acc[caminhoBase] || {}), '': caminhoCompleto };
      return acc;
    }

    const nomeBase = nomeArquivo.substring(0, primeiroPontoNomeArquivoIndex);
    const chaveDaExtensao = nomeArquivo.substring(primeiroPontoNomeArquivoIndex + 1);
    const diretorio = ultimaBarraIndex === -1 
      ? '' 
      : caminhoCompleto.substring(0, ultimaBarraIndex + 1);

    const baseParaAgrupamento = diretorio + nomeBase;

    acc[baseParaAgrupamento] = {
      ...(acc[baseParaAgrupamento] || {}),
      [chaveDaExtensao]: caminhoCompleto,
    };

    return acc;
  }, {} as ArquivosAgrupados);
}