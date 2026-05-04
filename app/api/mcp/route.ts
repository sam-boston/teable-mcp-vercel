import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Make sure any trailing slashes in the env variable are cleaned up
const TEABLE_BASE = process.env.TEABLE_BASE!.replace(/\/$/, '');
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

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
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
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    if (!args || typeof args !== "object") {
      throw new Error("Invalid arguments provided.");
    }

    try {
      if (name === "teable_get_records") {
        const url = new URL(`/api/table/${args.tableId}/record`, TEABLE_BASE);
        if (args.take) url.searchParams.set("take", String(args.take));
        if (args.skip) url.searchParams.set("skip", String(args.skip));
        if (args.fieldKeyType) url.searchParams.set("fieldKeyType", args.fieldKeyType as string);
        if (args.cellFormat) url.searchParams.set("cellFormat", args.cellFormat as string);
        const data = await teable(url.pathname + url.search, { method: "GET" });
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      }

      if (name === "teable_create_records") {
        const data = await teable(`/api/table/${args.tableId}/record`, {
          method: "POST",
          body: JSON.stringify({ records: args.records })
        });
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      }

      if (name === "teable_update_records") {
        const data = await teable(`/api/table/${args.tableId}/record`, {
          method: "PATCH",
          body: JSON.stringify({ records: args.records })
        });
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      }

      if (name === "teable_delete_records") {
        const data = await teable(`/api/table/${args.tableId}/record`, {
          method: "DELETE",
          body: JSON.stringify({ ids: args.ids })
        });
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      }

      throw new Error(`Tool not found: ${name}`);
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `API Error: ${error.message}` }],
        isError: true
      };
    }
  });

  return server;
}

// Solid HTTP handler that patiently waits for Teable's response
export async function POST(req: Request) {
  const body = await req.json();
  const server = buildMcpServer();
  
  let resolveResponse: (value: any) => void;
  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  
  const transport = {
    onmessage: undefined as any,
    onclose: undefined as any,
    onerror: undefined as any,
    start: async () => {},
    close: async () => {},
    send: async (message: any) => {
      resolveResponse(message);
    }
  };

  await server.connect(transport as any);
  if (transport.onmessage) {
    transport.onmessage(body);
  }
  
  // Vercel will wait right here until Teable sends the data back
  const responseMessage = await responsePromise;
  return Response.json(responseMessage);
}

// Fallback just in case FuseBase sends a ping
export const GET = POST;
