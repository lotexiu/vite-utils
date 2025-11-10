import path from 'path';
import fs from "fs-extra";
import type { PluginOption } from 'vite';
import { groupFilesByBase, loadRootPackage, ROOT_DIR } from '../utils.ts';

/**
 * @param {object} options
 * @param {string} options.outputDir - O diretório de saída da build (ex: 'dist')
 * @param {string} options.mainFile - O arquivo JS/MJS principal (ex: 'index.js')
 * @param {string} options.typesFile - O arquivo de declaração de tipos (ex: 'index.d.ts')
 * @returns {import('vite').Plugin}
 */
export function updatePackageJsonPlugin(): PluginOption {
  const pkgPath = path.resolve(ROOT_DIR, 'package.json');
	let outDir: string;
  const ignoredFiles: string[] = [];

  return {
    name: 'update-package-json-exports',
		configResolved(conf) { outDir = conf.build.outDir; },

    generateBundle(_options, bundle) {
      ignoredFiles.length = 0; 
      for (const fileName in bundle) { 
        const file = bundle[fileName];
        if (file.type === 'chunk' && !file.isEntry) {
            ignoredFiles.push(fileName);
        }
        if (fileName.endsWith('.map')) {
            ignoredFiles.push(fileName);
        }
      }
    },

    async closeBundle() {
      const pathOutDir = path.relative(ROOT_DIR, outDir);
      const allFiles = fs.globSync(`${outDir}/**/*.*`).map(f => path.relative(pathOutDir, f));
      const files = allFiles.filter(file => !ignoredFiles.includes(file));
      const groupedFiles: Record<string, Record<string, string>> = groupFilesByBase(files);
      const pkg = loadRootPackage();
      const previousExports = pkg.exports || {};
      pkg.exports = {};
      Object.entries(groupedFiles).forEach(([base, variants]) => {
        const relativePath = function(file: string) {
          if (!file) return undefined;
          return `./${path.relative(ROOT_DIR, path.join(outDir, file))}`;
        }
        pkg.exports[`./${base}`] = {
          import: {
            types: relativePath(variants['d.mts'] || variants['d.cts'] || variants['d.ts']),
            default: relativePath(variants['mjs'] || variants['cjs'] || variants['js'] || variants['json'] || variants['wasm'])
          },
          require: {
            types: relativePath(variants['d.cts'] || variants['d.ts'] || variants['d.mts']),
            default: relativePath(variants['cjs'] || variants['js'] || variants['mjs'] || variants['json'] || variants['wasm'])
          },
          style: relativePath(variants['css'] || variants['scss'] || variants['sass'] || variants['less'] || variants['styl']),
          sass: relativePath(variants['scss'] || variants['sass']),
          less: relativePath(variants['less']),
        };
      })
      const [newPkg, prevPkg] = [JSON.stringify(pkg.exports, null, 2), JSON.stringify(previousExports, null, 2)]
      if (newPkg !== prevPkg && [null,undefined,'','{}'].includes(newPkg) === false) {
        fs.writeJSON(pkgPath, pkg, { spaces: 2 });
      }
    },
  };
}