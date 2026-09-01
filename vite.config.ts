import { defineConfig } from 'vite';

export default defineConfig({
  // strictPort : plutot echouer que basculer en silence sur un autre port
  server: { port: 5180, strictPort: true, open: true },
  build: { target: 'es2020' },
});
