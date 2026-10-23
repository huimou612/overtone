import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Folia 视觉窗口宿主（路线 B / P1）。
// - dev: 主进程 dev 模式直接加载 http://localhost:9090（见 src/main/modules/folia/main.ts）
// - prod: 产物被主进程 webpack 的 CopyPlugin 复制到 dist/folia/
//   （见 build-config/main/webpack.config.prod.js 的注释约定）。
// 约定：base './'（file:// 加载）、产物文件名稳定、emptyOutDir 关闭
// （宿主 safe-delete 钩子会卡 trash，清理交给主进程构建侧）。
export default defineConfig({
  plugins: [react()],
  // 切片源码位于本包之外，esbuild 按文件向上找 tsconfig 会撞到仓库根的
  // tsconfig（extends @tsconfig/recommended，本包没装）而失败。
  // 这里统一给定转译参数，不再逐文件查 tsconfig（见 doc 09 第 8 节的已知小债）。
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        target: 'ES2022',
        jsx: 'react-jsx',
        useDefineForClassFields: true,
      },
    },
  },
  base: './',
  server: { port: 9090, strictPort: true },
  preview: { port: 9090, strictPort: true },
  resolve: {
    alias: [
      // 切片源码在本包之外，node 向上查找找不到本包的 node_modules；
      // 把切片用到的裸包名统一钉到本包的依赖上（版本由本包 package.json 锁定）。
      { find: /^react$/, replacement: path.resolve(dirname, 'node_modules/react') },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(dirname, 'node_modules/react/jsx-runtime.js') },
      { find: /^react-dom$/, replacement: path.resolve(dirname, 'node_modules/react-dom') },
      { find: /^react-dom\/client$/, replacement: path.resolve(dirname, 'node_modules/react-dom/client.js') },
      { find: /^framer-motion$/, replacement: path.resolve(dirname, 'node_modules/framer-motion') },
      { find: /^pixi\.js$/, replacement: path.resolve(dirname, 'node_modules/pixi.js') },
      { find: /^lucide-react$/, replacement: path.resolve(dirname, 'node_modules/lucide-react') },
      { find: /^@chenglou\/pretext$/, replacement: path.resolve(dirname, 'node_modules/@chenglou/pretext') },
      { find: /^@chenglou\/pretext\/rich-inline$/, replacement: path.resolve(dirname, 'node_modules/@chenglou/pretext/dist/rich-inline.js') },
    ],
  },
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
