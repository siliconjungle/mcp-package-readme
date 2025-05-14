/* package-readme.mcp.ts  – high-level helper that Just Works */

import { McpServer }            from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch                    from "node-fetch";
import { z }                    from "zod";

/* ── argument shape (raw Zod shape object – NOT z.object()) ────────── */
const ParamShape = {
  name   : z.string().describe('Package name, e.g. "react"'),
  version: z.string().optional()
                   .describe('Semver (defaults to registry "latest")'),
};
const ParamSchema = z.object(ParamShape);
type  ReadmeArgs  = z.infer<typeof ParamSchema>;

/* ── GitHub-first → npm-fallback lookup ────────────────────────────── */
async function fetchReadme (pkg: string, ver?: string): Promise<string> {
  const res  = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
  if (!res.ok) throw new Error(`${pkg}: registry HTTP ${res.status}`);
  const meta : any = await res.json();

  const version = ver ?? meta["dist-tags"]?.latest;
  const vObj    = meta.versions?.[version];
  if (!vObj) throw new Error(`${pkg}: version "${version}" not found`);

  /* 1️⃣  GitHub raw README ------------------------------------------- */
  const repoUrl = (vObj.repository ?? meta.repository)?.url ?? vObj.repository ?? meta.repository ?? "";
  const m       = /^git\+?https?:\/\/github\.com\/([^/]+)\/([^/.]+?)/i.exec(repoUrl);
  if (m) {
    const [user, repo] = m.slice(1);
    const file  = vObj.readmeFilename || meta.readmeFilename || "README.md";
    for (const ref of [`v${version}`, version, "main", "master"]) {
      const url = `https://raw.githubusercontent.com/${user}/${repo}/${ref}/${file}`;
      const txt = await fetch(url).then(r => r.ok ? r.text() : null).catch(()=>null);
      if (txt) return txt;
    }
  }

  /* 2️⃣  npm registry blob ------------------------------------------- */
  return vObj.readme ?? meta.readme
      ?? `⚠️  README not found for ${pkg}@${version}.`;
}

/* ── MCP server setup ──────────────────────────────────────────────── */
const mcp = new McpServer({ name:"mcp-package-readme", version:"0.1.0" });

mcp.tool(
  "readme",
  ParamShape,                                  // raw shape → SDK does the rest
  async ({ name, version }: ReadmeArgs) => ({
    content: [{
      type : "text",
      text : await fetchReadme(name, version)
    }]
  })
);

/* ── run on stdio ──────────────────────────────────────────────────── */
await mcp.connect(new StdioServerTransport());
console.error("📦  mcp-package-readme running on stdio");
