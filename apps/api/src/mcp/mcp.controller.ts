import { Controller, Post, Req, Res, Body, UseGuards, HttpCode } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Public } from '../common/public.decorator';
import { PatAuthGuard, PatAuth } from './pat-auth.guard';
import { McpServerFactory } from './mcp-server-factory';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcpServerFactory: McpServerFactory) {}

  @Public()
  @UseGuards(PatAuthGuard)
  @Post()
  @HttpCode(200)
  async handleMcpRequest(
    @Req() req: Request & { patAuth?: PatAuth; auth?: any },
    @Res() res: Response,
    @Body() body: any,
  ): Promise<void> {
    if (req.patAuth) {
      req.auth = {
        token: 'pat',
        clientId: 'mcp',
        scopes: req.patAuth.scopes,
        extra: { ownerId: req.patAuth.ownerId },
      };
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = this.mcpServerFactory.createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }
}
