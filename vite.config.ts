import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// le site est servi depuis un sous-dossier du lab : tout ce que Vite ecrit doit
// en porter le prefixe, en developpement comme dans le build. Le sous-dossier
// est le nom npm du projet, celui-la meme ou le deploiement publie — les deux
// ne peuvent donc pas diverger. BASE_PATH surcharge au besoin.
const { name } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: process.env.BASE_PATH || `/${name}/`,
  // strictPort : plutot echouer que basculer en silence sur un autre port
  server: { port: 5180, strictPort: true, open: true },
  build: { target: 'es2020' },
});
