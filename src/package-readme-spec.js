import { z }    from 'zod';
import fetch    from 'node-fetch';
import { nanoid } from 'nanoid';

/* ────────── parameter shape ───────────────────────────────────────── */
const ParamShape = {
  name   : z.string().describe('Package name, e.g. "react"'),
  version: z.string().optional()
                   .describe('Semver (defaults to registry “latest”)'),
};

/* ────────── helper: normalise results ─────────────────────────────── */
const asResult = (text) => ({
  content: [{ type: 'text', text }],
});

/* ────────── README fetcher ────────────────────────────────────────── */
async function fetchReadme(pkg, ver) {
  const res  = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
  if (!res.ok) throw new Error(`${pkg}: registry HTTP ${res.status}`);
  const meta = await res.json();

  const version = ver ?? meta['dist-tags']?.latest;
  const vObj    = meta.versions?.[version];
  if (!vObj) throw new Error(`${pkg}: version "${version}" not found`);

  /* 1️⃣  GitHub raw README ------------------------------------------- */
  const repoUrl = (vObj.repository ?? meta.repository)?.url
               ?? vObj.repository ?? meta.repository ?? '';
  const m = /^git\+?https?:\/\/github\.com\/([^/]+)\/([^/.]+?)/i.exec(repoUrl);
  if (m) {
    const [user, repo] = m.slice(1);
    const file = vObj.readmeFilename || meta.readmeFilename || 'README.md';
    for (const ref of [`v${version}`, version, 'main', 'master']) {
      const url  = `https://raw.githubusercontent.com/${user}/${repo}/${ref}/${file}`;
      const txt  = await fetch(url).then(r => r.ok ? r.text() : null).catch(() => null);
      if (txt) return txt;
    }
  }

  /* 2️⃣  npm registry blob ------------------------------------------- */
  return vObj.readme ?? meta.readme
      ?? `⚠️  README not found for ${pkg}@${version}.`;
}

/* ────────── exported spec object ──────────────────────────────────── */
export const packageReadmeSpec = {
  id         : 'package-readme',
  instanceId : nanoid(),
  description: 'Fetch the README of any npm package (GitHub-first, registry fallback).',

  tools: [{
    name       : 'readme',
    description: 'Get the README for an npm package.',
    parameters : ParamShape,            // raw Zod-shape (not z.object)
    async execute({ name, version }) {
      return asResult(await fetchReadme(name, version));
    },
  }],
};

export default packageReadmeSpec;
