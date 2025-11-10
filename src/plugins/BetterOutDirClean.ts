import type { PluginOption } from 'vite';
import fs from 'fs-extra';
import path from 'path';

/**
 * Retorna o nome base do arquivo (ex: 'index.js' -> 'index')
 */
function getBaseName(filePath: string): string {
	return filePath.replace(/(\.[^.]+(?:\.map)?)+$/, '');
}

export function betterOutDirCleanPlugin(): PluginOption {
  let outDir: string;
  const generatedFiles: Set<string> = new Set(); 

  return {
    name: 'selective-clean-plugin',
    
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir || 'dist');
    },

    generateBundle(options, bundle) {
      for (const fileName in bundle) {
        generatedFiles.add(getBaseName(path.resolve(outDir, fileName))); 
      }
    },

    async closeBundle() {
      if (!fs.existsSync(outDir)) {
        return;
      }
      const existingFiles = fs.globSync(`${outDir}/**/*.*`)
      
      let deletedCount = 0;

      for (const filePath of existingFiles) {
				const baseName = getBaseName(filePath);
        if (!generatedFiles.has(baseName)) {
					fs.removeSync(filePath);
					deletedCount++;
        }
      }
      if (deletedCount > 0) {
          console.log(`[SelectiveClean] Limpeza seletiva concluída. ${deletedCount} arquivo(s) JS órfão(s) removido(s).`);
      }
    }
  };
}