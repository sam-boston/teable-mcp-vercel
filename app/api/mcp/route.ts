export const runtime = "edge";

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

const TOOLS = [
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
];

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Handshake Phase (The "Login")
    if (body.method === "initialize") {
      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "teable-mcp", version: "1.0.0" }
        }
      });
    }

    // 2. Identify Available Tools Phase
    if (body.method === "tools/list") {
      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: { tools: TOOLS }
      });
    }

    // 3. Execution Phase (The actual database work)
    if (body.method === "tools/call") {
      const { name, arguments: args } = body.params;
      let resultData;

      try {
        if (name === "teable_get_records") {
          const url = new URL(`/api/table/${args.tableId}/record`, TEABLE_BASE);
          if (args.take) url.searchParams.set("take", String(args.take));
          if (args.skip) url.searchParams.set("skip", String(args.skip));
          if (args.fieldKeyType) url.searchParams.set("fieldKeyType", args.fieldKeyType);
          if (args.cellFormat) url.searchParams.set("cellFormat", args.cellFormat);
          resultData = await teable(url.pathname + url.search, { method: "GET" });
        } 
        else if (name === "teable_create_records") {
          resultData = await teable(`/api/table/${args.tableId}/record`, {
            method: "POST",
            body: JSON.stringify({ records: args.records })
          });
        } 
        else if (name === "teable_update_records") {
          resultData = await teable(`/api/table/${args.tableId}/record`, {
            method: "PATCH",
            body: JSON.stringify({ records: args.records })
          });
        } 
        else if (name === "teable_delete_records") {
          resultData = await teable(`/api/table/${args.tableId}/record`, {
            method: "DELETE",
            body: JSON.stringify({ ids: args.ids })
          });
        } 
        else {
          throw new Error(`Tool not found: ${name}`);
        }

        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: { content: [{ type: "text", text: JSON.stringify(resultData) }] }
        });

      } catch (error: any) {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: { content: [{ type: "text", text: `API Error: ${error.message}` }], isError: true }
        });
      }
    }

    // Ignore notifications
    if (!body.id) {
      return new Response(null, { status: 202 });
    }

    // Catch-all
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      error: { code: -32601, message: "Method not found" }
    });

  } catch (e) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
}

export const GET = POST;
