import { PluginOption } from "vite";
import path from "path";
import fs from "fs-extra";

export function copyAllSASSPlugin(srcDir: string): PluginOption {
  function getAllScssFiles(dir: string): string[] {
    const files = fs.readdirSync(dir);
    let result: string[] = [];
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        result = result.concat(getAllScssFiles(fullPath));
      } else if (file.endsWith(".scss") || file.endsWith(".sass")) {
        result.push(fullPath);
      }
    }
    return result;
  }

  return {
    name: 'copy-all-scss',
    async writeBundle(options) {
      const scssFiles = getAllScssFiles(srcDir);
      await Promise.all(
        scssFiles.map(file => {
          const relativePath = path.relative(srcDir, file);
          const destPath = path.resolve(options.dir!, relativePath);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          return fs.promises.copyFile(file, destPath);
        })
      );
    },
  };
}