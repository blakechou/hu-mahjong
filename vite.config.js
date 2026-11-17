import { defineConfig } from 'vite';
// base './' 讓 build 出來的檔案可以直接放在 GitHub Pages 的子路徑
export default defineConfig({ base: './', server: { port: 5178 } });
