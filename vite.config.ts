import { defineConfig } from 'vite';

export default defineConfig({
  // le site est servi depuis un sous-dossier : tout ce que Vite ecrit doit en
  // porter le prefixe, en developpement comme dans le build
  base: '/morphing/',
  // strictPort : plutot echouer que basculer en silence sur un autre port
  server: { port: 5180, strictPort: true, open: true },
  build: { target: 'es2020' },
});
