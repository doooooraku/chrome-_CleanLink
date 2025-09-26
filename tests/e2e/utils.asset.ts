import { promises as fs } from 'fs';
import path from 'path';
import { distRoot, VHOST } from './utils';

interface ManifestRecord {
  file: string;
}

interface ManifestIndex {
  [entry: string]: ManifestRecord | undefined;
}

let manifestCache: ManifestIndex | null = null;

async function readManifest(): Promise<ManifestIndex> {
  if (manifestCache) {
    return manifestCache;
  }
  const manifestPath = path.join(distRoot, 'manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf-8');
  manifestCache = JSON.parse(raw) as ManifestIndex;
  return manifestCache;
}

export async function resolveByManifest(entry: string): Promise<string> {
  const manifest = await readManifest();
  const record = manifest[entry];
  if (!record?.file) {
    throw new Error(`manifest.json に ${entry} が見つかりません`);
  }
  return `${VHOST}/${record.file}`;
}

export async function resolveAssetContaining(fragment: string): Promise<string> {
  const assetsDir = path.join(distRoot, 'assets');
  const files = await fs.readdir(assetsDir);
  const match = files.find((file) => file.includes(fragment) && file.endsWith('.js'));
  if (!match) {
    throw new Error(`assets ディレクトリに ${fragment} を含むファイルが見つかりません`);
  }
  return `${VHOST}/assets/${match}`;
}
