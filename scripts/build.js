import esbuild from 'esbuild';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const isWatch = process.argv.includes('--watch');

async function build() {
  // Ensure dist directory exists
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });

  // Copy index.html to dist
  await fs.copyFile(
    path.join(root, 'src', 'index.html'),
    path.join(root, 'dist', 'index.html')
  );

  // Copy KaTeX fonts to dist
  const katexFontsDir = path.join(root, 'node_modules', 'katex', 'dist', 'fonts');
  const distFontsDir = path.join(root, 'dist', 'fonts');
  await fs.mkdir(distFontsDir, { recursive: true });
  try {
    const fonts = await fs.readdir(katexFontsDir);
    for (const font of fonts) {
      await fs.copyFile(
        path.join(katexFontsDir, font),
        path.join(distFontsDir, font)
      );
    }
  } catch { /* KaTeX fonts not found, skip */ }

  const buildOptions = {
    entryPoints: [path.join(root, 'src', 'renderer.js')],
    bundle: true,
    outdir: path.join(root, 'dist'),
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    sourcemap: true,
    loader: {
      '.woff': 'file',
      '.woff2': 'file',
      '.ttf': 'file',
      '.eot': 'file',
      '.svg': 'file',
    },
    assetNames: 'fonts/[name]',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  };

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('[build] Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('[build] Done.');
  }
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
