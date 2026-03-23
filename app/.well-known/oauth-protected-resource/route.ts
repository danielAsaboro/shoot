import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

// Required by MCP spec — tells clients this server uses direct Bearer tokens
// (no OAuth authorization server; keys are created via /api/agent/keys)
const handler = protectedResourceHandler({ authServerUrls: [] });
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
