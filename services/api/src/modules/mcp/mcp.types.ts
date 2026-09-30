import { Request } from 'express';

/** Identity and scope of the caller, derived from a validated MCP token. */
export interface McpContext {
  userId: string;
  organizationId: string;
  orgRole: string;
  scopes: string[];
  tokenId: string;
  displayName: string;
  email: string;
}

export interface McpRequest extends Request {
  mcpCtx?: McpContext;
}
