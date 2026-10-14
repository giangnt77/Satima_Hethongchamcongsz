import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import JavaScriptObfuscator from 'javascript-obfuscator';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gasDir = path.join(root, 'scripts', 'google-apps-script');
const entries = {
  EmployeeFrontend: path.join(gasDir, 'shims', 'employee.jsx'),
  AdminFrontend: path.join(gasDir, 'shims', 'admin.jsx'),
};
const logoPath = path.join(root, 'public', 'logo-gas.png');
const maxInlineScriptBytes = 160 * 1024;
const obfuscationOptions = {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  renameProperties: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  selfDefending: false,
  stringArray: true,
  stringArrayEncoding: [],
  stringArrayThreshold: 0.2,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
};

function splitUtf8(source, maxBytes) {
  const chunks = [];
  let chunk = '';
  let chunkBytes = 0;
  for (const character of source) {
    const characterBytes = Buffer.byteLength(character);
    if (chunkBytes + characterBytes > maxBytes && chunk) {
      chunks.push(chunk);
      chunk = '';
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

async function build() {
  const logoBase64 = await fs.readFile(logoPath, 'base64');
  const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8');
  const bundle = await esbuild.build({
    absWorkingDir: root,
    entryPoints: entries,
    outdir: path.join(gasDir, 'bundles'),
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: ['es2020'],
    minify: true,
    legalComments: 'none',
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    alias: {
      '@': root,
      'next/link': path.join(gasDir, 'shims', 'Link.jsx'),
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    logLevel: 'info',
  });

  const frontendFiles = new Map(bundle.outputFiles.map((file) => {
    const name = path.basename(file.path, '.js');
    const source = `const LOGO_DATA_URI=window.__GAS_LOGO_DATA_URI;${file.text.replaceAll('"/logo.png"', 'LOGO_DATA_URI')}`;
    return [
      name,
      JavaScriptObfuscator.obfuscate(source, obfuscationOptions).getObfuscatedCode()
        .replace(/<\/script/gi, '<\\/script'),
    ];
  }));
  Object.keys(entries).forEach((name) => {
    if (!frontendFiles.has(name)) throw new Error(`esbuild did not produce ${name}.`);
  });

  const sourceCss = await fs.readFile(path.join(root, 'app', 'globals.css'), 'utf8');
  const processedCss = await postcss([tailwind({ base: path.join(root, 'app') })]).process(sourceCss, {
    from: path.join(root, 'app', 'globals.css'),
    to: path.join(gasDir, 'Styles.html'),
  });
  const inlineSafeCss = processedCss.css
    .replace('--font-sans: var(--font-inter);', '--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;')
    .replace('--font-sans:var(--font-inter);', '--font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;')
    .replace(/<\/style/gi, '<\\/style');
  const logoHtml = `<script>window.__GAS_LOGO_DATA_URI=${JSON.stringify(`data:image/png;base64,${logoBase64}`)};</script>`;
  const softwareInfoHtml = `<script>window.__SATIMA_README__=${JSON.stringify(readme).replace(/<\/script/gi, '<\\/script')};</script>`;
  const adminSource = frontendFiles.get('AdminFrontend');
  const adminChunks = splitUtf8(adminSource, maxInlineScriptBytes);
  if (adminChunks.length > 10) {
    throw new Error(`Admin frontend requires ${adminChunks.length} chunks; maximum supported is 10.`);
  }
  while (adminChunks.length < 10) adminChunks.push('');
  const adminChunkFiles = adminChunks.map((chunk, index) => {
    const filename = `AdminFrontendPart${index + 1}.html`;
    const safeChunk = chunk.replace(/<\/script/gi, '<\\/script');
    return fs.writeFile(
      path.join(gasDir, filename),
      `<script>window.__GAS_ADMIN_CHUNKS.push(${JSON.stringify(safeChunk)});</script>`,
      'utf8'
    );
  });
  const adminRunner = '<script>(new Function(window.__GAS_ADMIN_CHUNKS.join("")))();</script>';

  await Promise.all([
    fs.writeFile(path.join(gasDir, 'EmployeeFrontend.html'), `<script>${frontendFiles.get('EmployeeFrontend')}</script>`, 'utf8'),
    fs.writeFile(path.join(gasDir, 'AdminFrontend.html'), adminRunner, 'utf8'),
    ...adminChunkFiles,
    fs.writeFile(path.join(gasDir, 'Logo.html'), logoHtml, 'utf8'),
    fs.writeFile(path.join(gasDir, 'SoftwareInfo.html'), softwareInfoHtml, 'utf8'),
    fs.writeFile(path.join(gasDir, 'Styles.html'), `<style>${inlineSafeCss}</style>`, 'utf8'),
  ]);

  const employeeBytes = Buffer.byteLength(frontendFiles.get('EmployeeFrontend'));
  const adminBytes = Buffer.byteLength(adminSource);
  console.log(`Built Apps Script frontend (employee: ${employeeBytes} JS bytes, admin: ${adminBytes} JS bytes in ${adminChunks.length} safe chunks, ${Buffer.byteLength(inlineSafeCss)} CSS bytes, ${Buffer.byteLength(logoHtml)} logo bytes, README: ${Buffer.byteLength(softwareInfoHtml)} bytes).`);
}

build().catch((error) => {
  console.error('Apps Script UI build failed:', error);
  process.exitCode = 1;
});
