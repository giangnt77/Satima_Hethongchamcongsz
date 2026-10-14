import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function GET() {
  const readme = await readFile(path.join(process.cwd(), 'README.md'), 'utf8');
  return new Response(readme, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
