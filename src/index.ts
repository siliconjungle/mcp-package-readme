/* ---------------------------------------------------------------------------
 * MCP server • package-readme  (TypeScript, full file)
 *   • Tool:  readme  → returns README.md for npm package@version
 *   • GitHub-first lookup, npm-registry fallback
 * ------------------------------------------------------------------------ */

import { McpServer }                 from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport }      from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch                         from "node-fetch";
import { z }                         from "zod";

/* ────────── parameter **shape** (plain object) ─────────────────────── */
const ReadmeParams = {
  name   : z.string().describe('Package name, e.g. "react"'),
  version: z.string().optional()
                  .describe('Semver (defaults to registry "latest")'),
};

/* ────────── helper utilities ───────────────────────────────────────── */
const npmMeta = (pkg: string) =>
  `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;

const npmPage = (pkg: string) =>
  `https://www.npmjs.com/package/${encodeURIComponent(pkg)}`;

const ghRaw = (u: string, r: string, ref: string, file: string) =>
  `https://raw.githubusercontent.com/${u}/${r}/${ref}/${file}`;

const parseGithub = (url = "") => {
  const m =
    /^git\+?https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/i.exec(url);
  return m ? { u: m[1], r: m[2] } : null;
};

const getText = async (url: string) =>
  fetch(url).then(r => (r.ok ? r.text() : null)).catch(() => null);

/* ────────── core lookup – GitHub-first, npm fallback ───────────────── */
async function fetchReadme(pkg: string, ver?: string): Promise<string> {
  const meta: any = await fetch(npmMeta(pkg)).then(async r => {
    if (!r.ok) throw new Error(`${pkg}: registry HTTP ${r.status}`);
    return r.json();
  });

  const version = ver ?? meta["dist-tags"]?.latest;
  const vObj    = meta.versions?.[version];
  if (!vObj) throw new Error(`${pkg}: version "${version}" not found`);

  /* 1 ▸ GitHub */
  const gh = parseGithub(vObj.repository?.url || meta.repository?.url);
  if (gh) {
    const file = vObj.readmeFilename || meta.readmeFilename || "README.md";
    for (const ref of [`v${version}`, version, "main", "master"]) {
      const txt = await getText(ghRaw(gh.u, gh.r, ref, file));
      if (txt) return txt;
    }
  }

  /* 2 ▸ registry blob */
  if (vObj.readme || meta.readme) return vObj.readme ?? meta.readme;

  /* 3 ▸ nothing */
  return `⚠️  README not found for ${pkg}@${version}. See ${npmPage(pkg)}`;
}

/* ────────── MCP server setup ───────────────────────────────────────── */
const server = new McpServer(
  { name: "mcp-package-readme", version: "0.1.0" }
);

/* readme tool (shape object passed directly) */
server.tool(
  "readme",
  { name: ReadmeParams.name, version: ReadmeParams.version },
  async (
    { name, version }
  ) => {
    try {
      const md = await fetchReadme(name, version);

      return {
        content: [{ type: 'text', text: md }],
      }
    } catch (err: any) {
      return {
        isError : true,
        content : [{ type: "text", text: String(err?.message ?? err) }],
      };
    }
  },
);

/* ────────── run over stdio ─────────────────────────────────────────── */
(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("📦  mcp-package-readme running on stdio");
})();
