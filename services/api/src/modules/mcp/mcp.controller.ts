import { Controller, Delete, Get, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Response } from 'express';
import { McpServerFactory } from './mcp-server.factory';
import { McpTokenGuard } from './mcp-token.guard';
import { McpRequest } from './mcp.types';

/**
 * Hosted MCP endpoint (Streamable HTTP, stateless). Each request builds a
 * fresh server bound to the caller's token context. `@Res()` bypasses the
 * global response envelope so JSON-RPC payloads go out unchanged.
 */
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  constructor(private serverFactory: McpServerFactory) {}

  @Post()
  @UseGuards(McpTokenGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async handle(@Req() req: McpRequest, @Res() res: Response) {
    const server = this.serverFactory.create(req.mcpCtx);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @Get()
  methodNotAllowedGet(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  @Delete()
  methodNotAllowedDelete(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  private methodNotAllowed(res: Response) {
    res
      .status(HttpStatus.METHOD_NOT_ALLOWED)
      .set('Allow', 'POST')
      .json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed. This server is stateless; use POST.',
        },
        id: null,
      });
  }
}
