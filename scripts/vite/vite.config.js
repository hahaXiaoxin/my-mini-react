import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import replace from '@rollup/plugin-replace';
import { resolvePkgPath } from '../rollup/utils';
import path from 'path';

const pkgPath = path.resolve(__dirname, '../../packages');

// 自定义插件：监听 packages 目录变化并触发页面刷新
function watchPackages() {
  return {
    name: 'watch-packages',
    configureServer(server) {
      server.watcher.add(pkgPath);
      server.watcher.on('change', (file) => {
        if (file.includes('packages')) {
          console.log(`\n[watch-packages] ${file} changed, reloading...`);
          server.ws.send({ type: 'full-reload' });
        }
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    replace({
      __DEV__: true,
      preventAssignment: true
    }),
    watchPackages()
  ],
  resolve: {
    alias: [
      {
        find: 'react',
        replacement: resolvePkgPath('react')
      },
      {
        find: 'react-dom',
        replacement: resolvePkgPath('react-dom')
      },
      {
        find: 'host-config',
        replacement: path.resolve(resolvePkgPath('react-dom'), './src/host-config.ts')
      }
    ]
  },
  // 确保 packages 不被预构建缓存
  optimizeDeps: {
    exclude: ['react', 'react-dom']
  }
});
