/* --------------------------------------------------------------------------
 * MCP server • package-readme
 *   • Tool:  readme  → returns README.md for npm package@version
 *   • GitHub-first lookup, npm-registry fallback
 *   • Parameter schema is a **shape object** (not z.object(…))
 * ------------------------------------------------------------------------ */

import { Server }                  from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport }    from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch            from 'node-fetch';
import { z }            from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/* ────────── parameter **shape** (plain object, no z.object()) ────────── */
const ParamsShape = {
  name   : z.string().describe('Package name, e.g. "react"'),
  version: z.string().optional()
                 .describe('Semver (defaults to registry "latest")'),
};

/* helpers -------------------------------------------------------------- */
const npmMeta = (p: string) => `https://registry.npmjs.org/${encodeURIComponent(p)}`;
const npmPage = (p: string) => `https://www.npmjs.com/package/${encodeURIComponent(p)}`;
const ghRaw   = (u: string, r: string, ref: string, f: string) =>
  `https://raw.githubusercontent.com/${u}/${r}/${ref}/${f}`;

const parseGithub = (url = '') => {
  const m = /^git\+?https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/i.exec(url);
  return m ? { u: m[1], r: m[2] } : null;
};

const getText = async (url: string) =>
  fetch(url).then(r => (r.ok ? r.text() : null)).catch(() => null);

const wrap = (txt: string) => ({ content: [{ type: 'text', text: txt }] });

/* GitHub-first, npm-fallback ------------------------------------------ */
async function fetchReadme(pkg: string, ver?: string): Promise<string> {
  const meta: any = await fetch(npmMeta(pkg)).then(async r => {
    if (!r.ok) throw new Error(`${pkg}: registry HTTP ${r.status}`);
    return r.json();
  });

  const version = ver ?? meta['dist-tags']?.latest;
  const vObj    = meta.versions?.[version];
  if (!vObj) throw new Error(`${pkg}: version "${version}" not found`);

  /* 1 ▸ GitHub */
  const gh = parseGithub(vObj.repository?.url || meta.repository?.url);
  if (gh) {
    const file = vObj.readmeFilename || meta.readmeFilename || 'README.md';
    for (const ref of [`v${version}`, version, 'main', 'master']) {
      const txt = await getText(ghRaw(gh.u, gh.r, ref, file));
      if (txt) return txt;
    }
  }

  /* 2 ▸ npm registry blob */
  if (vObj.readme || meta.readme) return vObj.readme ?? meta.readme;

  /* 3 ▸ nothing found */
  return `⚠️  README not found for ${pkg}@${version}. See ${npmPage(pkg)}`;
}

/* ─────────────────────── MCP server wiring ─────────────────────────── */
const server = new Server(
  { name: 'mcp-package-readme', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

/* list-tools ---------------------------------------------------------- */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name       : 'readme',
      description: 'Return the README markdown for npm package@version. '
                 + 'Looks on GitHub first, then falls back to the npm registry blob.',

      // convert shape → z.object(shape) → JSON-Schema for the protocol
      inputSchema: zodToJsonSchema(
                     z.object(ParamsShape)
                   ) as z.infer<typeof ToolSchema>['inputSchema'],
    },
  ],
}));

/* call-tool ----------------------------------------------------------- */
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    if (req.params.name !== 'readme')
      throw new Error(`Unknown tool: ${req.params.name}`);

    const { name, version } = z.object(ParamsShape).parse(req.params.arguments);
    const md = await fetchReadme(name, version);
    return wrap(md);
  } catch (e: any) {
    return { isError: true,
             content: [{ type: 'text', text: String(e.message ?? e) }] };
  }
});

/* ───────────────────────── run over stdio ─────────────────────────── */
(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('📦  mcp-package-readme running on stdio');
})();
