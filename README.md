# 📦 mcp-package-readme

Model Context Protocol (MCP) server that returns the **README.md** for any npm package (GitHub-first lookup, npm fallback).

## Quick-start

```bash
npm install
npm run build
node dist/index.js

docker build -t mcp/package-readme .
docker run -i --rm mcp/package-readme
