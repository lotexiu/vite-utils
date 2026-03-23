# @lotexiu/vite-utils

Coleção de plugins Vite customizados para o monorepo **aleph-typescript**. Estes plugins otimizam o processo de build para bibliotecas TypeScript, especialmente aquelas que usam o padrão `ReactWrapper`.

## Plugins Disponíveis

### 1. 🧹 BetterOutDirClean

Limpa arquivos órfãos do diretório de saída de forma inteligente, removendo apenas arquivos que não foram gerados no build atual.

```typescript
import { betterOutDirCleanPlugin } from '@lotexiu/vite-utils/plugins/BetterOutDirClean';

export default defineConfig({
  plugins: [betterOutDirCleanPlugin()],
});
```

**Benefícios:**
- Remove apenas arquivos obsoletos
- Preserva arquivos gerados manualmente
- Evita limpar todo o `dist/` a cada build

---

### 2. 📦 CopyAllSASS

Copia arquivos SASS/SCSS para o diretório de saída sem processá-los, útil para bibliotecas que exportam estilos.

```typescript
import { copyAllSASSPlugin } from '@lotexiu/vite-utils/plugins/CopyAllSASS';

export default defineConfig({
  plugins: [
    copyAllSASSPlugin('src'), // Diretório fonte
  ],
});
```

**Benefícios:**
- Mantém estrutura de arquivos SASS
- Permite que consumidores da lib processem SASS
- Ideal para design systems

---

### 3. 🚫 ExcludeSASSPProcess

Exclui arquivos SASS do processamento normal do Vite (deve ser usado com `CopyAllSASS`).

```typescript
import { excludeSASSPProcessPlugin } from '@lotexiu/vite-utils/plugins/ExcludeSASSPProcess';

export default defineConfig({
  plugins: [
    excludeSASSPProcessPlugin('src'),
  ],
});
```

---

### 4. 📄 MainPackage (UpdatePackageJson)

Gera `package.json` otimizado no `dist/` com apenas dependências necessárias.

```typescript
import { updatePackageJsonPlugin } from '@lotexiu/vite-utils/plugins/MainPackage';

export default defineConfig({
  plugins: [
    updatePackageJsonPlugin(),
  ],
});
```

**Benefícios:**
- Remove devDependencies
- Atualiza campos `main`, `module`, `types`
- Gera package.json limpo para publicação

---

## Instalação

```bash
# No monorepo
pnpm add @lotexiu/vite-utils --filter=your-package

# Standalone
pnpm add @lotexiu/vite-utils
```

## Configuração Completa

Exemplo usando todos os plugins juntos:

```typescript
import { defineConfig } from 'vite';
import {
  betterOutDirCleanPlugin,
  copyAllSASSPlugin,
  excludeSASSPProcessPlugin,
  updatePackageJsonPlugin,
} from '@lotexiu/vite-utils';

export default defineConfig({
  plugins: [
    betterOutDirCleanPlugin(),
    copyAllSASSPlugin('src'),
    excludeSASSPProcessPlugin('src'),
    updatePackageJsonPlugin(),
  ],
  build: {
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    },
  },
});
```

Veja o [exemplo completo](./examples/vite.config.example.ts).

## Exports

O pacote usa exports granulares:

```typescript
// Importar utilitários
import { someUtil } from '@lotexiu/vite-utils/utils';
```

## Dependências

- `vite` >= 5.0
- `typescript` >= 5.3
- `fs-extra` >= 11.2
- `@types/node` >= 20.10

## Casos de Uso

### Bibliotecas React

```typescript
export default defineConfig({
  plugins: [
    betterOutDirCleanPlugin(),
  ],
  build: {
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
    },
  },
});
```

### Design Systems com SASS

```typescript
export default defineConfig({
  plugins: [
    betterOutDirCleanPlugin(),
    copyAllSASSPlugin('src'),
    excludeSASSPProcessPlugin('src'),
  ],
});
```

### Utilitários TypeScript Puros

```typescript
export default defineConfig({
  plugins: [
    betterOutDirCleanPlugin(),
  ],
  build: {
    lib: {
      entry: './src/index.ts',
      formats: ['es', 'cjs'],
    },
  },
});
```

## Desenvolvimento

```bash
# Build
pnpm run buildx

# Dev (watch mode)
pnpm dev
```

## Contribuindo

Ao adicionar novos plugins:

1. Crie arquivo em `src/plugins/YourPlugin.ts`
2. Exporte função com sufixo `Plugin`
3. Adicione documentação inline
4. Atualize este README
5. Crie exemplos em `examples/`

## Troubleshooting

### "Cannot find module '@lotexiu/vite-utils'"

Verifique que o pacote está no workspace:

```bash
pnpm install
```

### Plugins não estão funcionando

1. Verifique a ordem dos plugins (alguns dependem de outros)
2. Confirme que está usando `PluginOption` do Vite
3. Verifique logs do build


## Licença

MIT - Veja LICENSE no repositório principal.

## Pacotes Relacionados

- [@lotexiu/typescript](../typescript) - Extensões TypeScript avançadas
- [@lotexiu/react](../react) - Sistema ReactWrapper
- [@lotexiu/typescript-config](../typescript-config) - Configurações TSConfig compartilhadas

