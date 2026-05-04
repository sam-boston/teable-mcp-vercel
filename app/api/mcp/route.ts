export const runtime = "edge";

// Notice we keep the .js here because Next.js requires it for NPM ESM module resolution, 
// but we completely removed the hallucinated WebSocket import.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

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
    async (args: any) => {
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
    async (args: any) => {
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
    async (args: any) => {
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
    async (args: any) => {
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

  // @ts-ignore Edge runtime provides WebSocketPair
  const { 0: client, 1: serverSocket } = new WebSocketPair();

  const mcpServer = buildMcpServer();
  
  // Create a custom transport to bridge Vercel Edge WebSockets to MCP
  const transport = {
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    onmessage: undefined as ((message: any) => void) | undefined,
    start: async () => {
      serverSocket.accept();
    },
    close: async () => {
      serverSocket.close();
    },
    send: async (message: any) => {
      serverSocket.send(JSON.stringify(message));
    }
  };

  serverSocket.addEventListener("message", (event: any) => {
    try {
      const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (transport.onmessage) transport.onmessage(message);
    } catch (e) {
      if (transport.onerror) transport.onerror(e as Error);
    }
  });

  serverSocket.addEventListener("close", () => {
    if (transport.onclose) transport.onclose();
  });

  serverSocket.addEventListener("error", (error: any) => {
    if (transport.onerror) transport.onerror(error);
  });

  // Connect the MCP server using our custom edge transport
  // @ts-ignore - bypassing strict type checking for the custom transport
  mcpServer.connect(transport);

  return new Response(null, { status: 101, webSocket: client } as any);
}

export const POST = GET;
