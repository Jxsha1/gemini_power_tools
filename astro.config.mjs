import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  build: {
    assets: 'assets'
  },
  vite: {
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
