import { defineConfig } from 'astro/config';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  output: 'static',
  build: {
    assets: 'assets'
  },
  vite: {
    plugins: [{
      name: 'flatten-sidebar-html',
      closeBundle() {
        const nestedPath = path.resolve('dist/src/pages/sidebar/index.html');
        const targetPath = path.resolve('dist/sidebar.html');
        
        if (fs.existsSync(nestedPath)) {
          fs.renameSync(nestedPath, targetPath);
          console.log('Sidebar layout successfully flattened to the build root.');
        } else if (fs.existsSync(path.resolve('dist/sidebar/index.html'))) {
          fs.renameSync(path.resolve('dist/sidebar/index.html'), targetPath);
        }
      }
    }],
    build: {
      rollupOptions: {
        output: {
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return 'assets/sidebar.[ext]';
            }
            return 'assets/[name].[ext]';
          }
        }
      }
    }
  }
});
