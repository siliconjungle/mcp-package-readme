/* ---------------------------------------------------------------------------
 * MCP server • package-readme
 *   • Tool:  readme  → returns README.md for npm package@version
 *   • GitHub-first lookup, npm-registry fallback
 * ------------------------------------------------------------------------- */

import { Server }               from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { z }  from "zod";

/* ────── 1. Parameter definition ──────────────────────────────────── */

// (a) **Shape object** – the thing we expose in list-tools
const ParamShape = {
  name   : z.string().describe('Package name, e.g. "react"'),
  version: z.string().optional()
           .describe('Semver (defaults to registry "latest")'),
};

// (b) Full ZodObject – only used internally for validation
const Params      = z.object(ParamShape);
type  ReadmeArgs  = z.infer<typeof Params>;

/* ────── 2. Helper utilities ──────────────────────────────────────── */

const npmMeta = (pkg: string) =>
  `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;

const npmPage = (pkg: string) =>
  `https://www.npmjs.com/package/${encodeURIComponent(pkg)}`;

const ghRaw = (u: string, r: string, ref: string, file: string) =>
  `https://raw.githubusercontent.com/${u}/${r}/${ref}/${file}`;

const parseGithub = (url = "") => {
  const m = /^git\+?https?:\/\/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/i.exec(url);
  return m ? { u: m[1], r: m[2] } : null;
};

const getText = async (url: string) =>
  fetch(url).then(r => (r.ok ? r.text() : null)).catch(() => null);

/* ────── 3. Core lookup – GitHub-first, npm fallback ──────────────── */

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

  /* 2 ▸ npm registry blob */
  if (vObj.readme || meta.readme) return vObj.readme ?? meta.readme;

  /* 3 ▸ nothing */
  return `⚠️  README not found for ${pkg}@${version}. See ${npmPage(pkg)}`;
}

/* ────── 4. MCP server wiring ─────────────────────────────────────── */

const server = new Server(
  { name: "mcp-package-readme", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

/* list-tools → advertise the **shape object** */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name       : "readme",
    description: "Return the README markdown for npm package@version "
               + "(GitHub-first, npm fallback).",
    inputSchema: ParamShape,          // ← plain shape ✅
  }],
}));

/* call-tool → validate with full `Params` */
server.setRequestHandler(CallToolRequestSchema, async req => {
  try {
    if (req.params.name !== "readme")
      throw new Error(`Unknown tool: ${req.params.name}`);

    const { name, version } = Params.parse(req.params.arguments as object) as ReadmeArgs;
    const md = await fetchReadme(name, version);

    return { content: [{ type: "text", text: md }] };
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: "text", text: String(err?.message ?? err) }],
    };
  }
});

/* ────── 5. Run over stdio ─────────────────────────────────────────── */

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("📦  mcp-package-readme running on stdio");
