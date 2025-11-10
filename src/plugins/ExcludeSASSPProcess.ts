import { PluginOption } from "vite";
import path from "path";
import fs from "fs-extra";

export function excludeSASSPProcessPlugin(srcDir: string): PluginOption {
  const patterns: RegExp = /\.(scss|sass)$/;
  const files: string[] = [];

  return {
    name: "exclude-sass-preprocess",
    enforce: "pre",

    resolveId(id, importer) {
      if (patterns.test(id)) {
        const file: string = id.replace(/\?.*/, '');
        const filepath: string = file.startsWith('@/')
          ? file.replace('@', srcDir)
          : path.resolve(path.dirname(importer!), file);
        files.push(filepath);
        return { id: file, external: true };
      }
    },

    async writeBundle(options): Promise<void> {
      await Promise.all(
        files.map((file): void  => {
          const dist: string = file.replace(srcDir, options.dir!);
          return fs.copyFile(file, dist, (): void =>{});
        })
      );
    }
  }
}