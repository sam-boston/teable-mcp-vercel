export const runtime = "edge";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebSocketServerTransport } from "@modelcontextprotocol/sdk/server/websocket.js";

const TEABLE_BASE = process.env.TEABLE_BASE!;
const TEABLE_TOKEN = process.env.TEABLE_TOKEN!;

async function teable(path: string, init?: RequestInit) {
  const res = await fetch(`${TEABLE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TEABLE_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

function buildMcpServer() {
  const server = new Server(
    { name: "teable-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.tool(
    {
      name: "teable_get_records",
      description: "List Teable records from a table",
      inputSchema: {
        type: "object",
        properties: {
          tableId: { type: "string" },
          take: { type: "number" },
          skip: { type: "number" },
          fieldKeyType: { type: "string", enum: ["name", "id", "dbFieldName"] },
          cellFormat: { type: "string", enum: ["json", "text"] }
        },
        required: ["tableId"]
      }
    },
    async (args) => {
      const url = new URL(`/api/table/${args.tableId}/record`, TEABLE_BASE);
      if (args.take) url.searchParams.set("take", String(args.take));
      if (args.skip) url.searchParams.set("skip", String(args.skip));
      if (args.fieldKeyType) url.searchParams.set("fieldKeyType", args.fieldKeyType);
      if (args.cellFormat) url.searchParams.set("cellFormat", args.cellFormat);
      const data = await teable(url.pathname + url.search, { method: "GET" });
      return { content: [{ type: "json", json: data }] };
    }
  );

  server.tool(
    {
      name: "teable_create_records",
      description: "Create one or more records",
      inputSchema: {
        type: "object",
        properties: {
          tableId: { type: "string" },
          records: {
            type: "array",
            items: {
              type: "object",
              properties: { fields: { type: "object" } },
              required: ["fields"]
            },
            minItems: 1
          }
        },
        required: ["tableId", "records"]
      }
    },
    async (args) => {
      const data = await teable(`/api/table/${args.tableId}/record`, {
        method: "POST",
        body: JSON.stringify({ records: args.records })
      });
      return { content: [{ type: "json", json: data }] };
    }
  );

  server.tool(
    {
      name: "teable_update_records",
      description: "Update one or more records",
      inputSchema: {
        type: "object",
        properties: {
          tableId: { type: "string" },
          records: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                fields: { type: "object" }
              },
              required: ["id", "fields"]
            },
            minItems: 1
          }
        },
        required: ["tableId", "records"]
      }
    },
    async (args) => {
      const data = await teable(`/api/table/${args.tableId}/record`, {
        method: "PATCH",
        body: JSON.stringify({ records: args.records })
      });
      return { content: [{ type: "json", json: data }] };
    }
  );

  server.tool(
    {
      name: "teable_delete_records",
      description: "Delete one or more records",
      inputSchema: {
        type: "object",
        properties: {
          tableId: { type: "string" },
          ids: { type: "array", items: { type: "string" }, minItems: 1 }
        },
        required: ["tableId", "ids"]
      }
    },
    async (args) => {
      const data = await teable(`/api/table/${args.tableId}/record`, {
        method: "DELETE",
        body: JSON.stringify({ ids: args.ids })
      });
      return { content: [{ type: "json", json: data }] };
    }
  );

  return server;
}

export async function GET(req: Request) {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket request", { status: 400 });
  }

  // Edge runtime provides WebSocketPair
  // @ts-ignore
  const { 0: client, 1: serverSocket } = new WebSocketPair();

  const mcpServer = buildMcpServer();
  const transport = new WebSocketServerTransport(serverSocket);
  mcpServer.connect(transport);

  return new Response(null, { status: 101, webSocket: client } as any);
}

export const POST = GET;
