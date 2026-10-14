import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'scripts', 'google-apps-script');
const releaseDir = path.join(root, 'dist', 'satima-gas-release');
const requiredGlobalFunctions = [
  'doGet',
  'doPost',
  'onOpen',
  'include',
  'apiRequest',
  'setupSatimaForBusiness',
  'authorizeEmailNotifications',
  'enterLicenseKey',
  'activateLicense',
  'checkLicenseNow',
  'initializeGoogleSheets',
];
const filesToCopy = [
  'appsscript.json',
  'Index.html',
  'LicenseLock.html',
  'EmployeeFrontend.html',
  'AdminFrontend.html',
  'Logo.html',
  'SoftwareInfo.html',
  'Styles.html',
  ...Array.from({ length: 10 }, (_, index) => `AdminFrontendPart${index + 1}.html`),
];

async function release() {
  let sourceCode = await fs.readFile(path.join(sourceDir, 'Code.gs'), 'utf8');
  const licenseUrl = process.env.SATIMA_LICENSE_URL;
  const licenseSecret = process.env.SATIMA_LICENSE_SECRET;
  const licenseEnabled = Boolean(licenseUrl || licenseSecret);
  if (licenseEnabled) {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(licenseUrl || '') || !licenseSecret) {
      throw new Error('Community license build needs both SATIMA_LICENSE_URL (…/exec) and SATIMA_LICENSE_SECRET.');
    }
    const version = process.env.SATIMA_LICENSE_VERSION || new Date().toISOString().slice(0, 10);
    const secretCodes = Array.from(licenseSecret).map((char) => char.charCodeAt(0)).reverse();
    const config = `const LICENSE_CONFIG = ${JSON.stringify({ enabled: true, url: licenseUrl, secret: secretCodes, version })};`;
    const marker = /const LICENSE_CONFIG = \{[^\n]*\};/;
    if (!marker.test(sourceCode)) throw new Error('LICENSE_CONFIG marker is missing from Code.gs.');
    sourceCode = sourceCode.replace(marker, () => config);
  }
  for (const functionName of requiredGlobalFunctions) {
    if (!new RegExp(`\\bfunction\\s+${functionName}\\s*\\(`).test(sourceCode)) {
      throw new Error(`Required Apps Script entry point is missing: ${functionName}`);
    }
  }

  const result = JavaScriptObfuscator.obfuscate(sourceCode, {
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
    reservedNames: requiredGlobalFunctions.map((name) => `^${name}$`),
  }).getObfuscatedCode();

  try {
    new Function(result);
  } catch (error) {
    throw new Error(`Obfuscated Apps Script has invalid JavaScript syntax: ${error.message}`);
  }
  for (const functionName of requiredGlobalFunctions) {
    if (!new RegExp(`\\bfunction\\s+${functionName}\\s*\\(`).test(result)) {
      throw new Error(`Obfuscation changed the required Apps Script entry point: ${functionName}`);
    }
  }

  const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, 'appsscript.json'), 'utf8'));
  if (manifest.runtimeVersion !== 'V8') throw new Error('Apps Script release requires the V8 runtime.');
  if (licenseEnabled) {
    const scope = 'https://www.googleapis.com/auth/script.external_request';
    if (!manifest.oauthScopes.includes(scope)) manifest.oauthScopes.push(scope);
  }

  await fs.rm(releaseDir, { recursive: true, force: true });
  await fs.mkdir(releaseDir, { recursive: true });
  await Promise.all(filesToCopy.map(async (filename) => {
    const sourcePath = path.join(sourceDir, filename);
    await fs.access(sourcePath);
    await fs.copyFile(sourcePath, path.join(releaseDir, filename));
  }));
  if (licenseEnabled) {
    await fs.writeFile(path.join(releaseDir, 'appsscript.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  await fs.writeFile(path.join(releaseDir, 'Code.gs'), result, 'utf8');

  const originalBytes = Buffer.byteLength(sourceCode);
  const releaseBytes = Buffer.byteLength(result);
  console.log(`Release package created at ${path.relative(root, releaseDir)}.`);
  console.log(`Apps Script source: ${originalBytes} bytes; obfuscated: ${releaseBytes} bytes.`);
  console.log('Source project was not modified. Verify a test deployment before sharing this package.');
}

release().catch((error) => {
  console.error('Apps Script release build failed:', error);
  process.exitCode = 1;
});
