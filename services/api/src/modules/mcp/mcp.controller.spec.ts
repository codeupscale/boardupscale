import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import { McpServerFactory } from './mcp-server.factory';
import { McpTokenGuard } from './mcp-token.guard';
import { McpController } from './mcp.controller';

const ACCEPT = 'application/json, text/event-stream';

describe('McpController (HTTP)', () => {
  let app: INestApplication;
  let apiKeysService: { validate: jest.Mock };

  beforeEach(async () => {
    apiKeysService = {
      validate: jest.fn().mockResolvedValue({
        id: 'tok',
        userId: 'user-1',
        orgId: 'org-1',
        scopes: ['mcp:read', 'mcp:comment'],
        user: { displayName: 'Ada', email: 'ada@example.com' },
      }),
    };
    const factory = new McpServerFactory(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        McpTokenGuard,
        { provide: McpServerFactory, useValue: factory },
        { provide: ApiKeysService, useValue: apiKeysService },
        {
          provide: getRepositoryToken(OrganizationMember),
          useValue: { findOne: jest.fn().mockResolvedValue({ role: 'user' }) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterEach(() => app.close());

  const rpc = () =>
    request(app.getHttpServer())
      .post('/api/mcp')
      .set('Accept', ACCEPT)
      .set('Authorization', 'Bearer bu_mcp_test');

  it('rejects requests without an MCP token', async () => {
    await request(app.getHttpServer())
      .post('/api/mcp')
      .set('Accept', ACCEPT)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      .expect(401);
    expect(apiKeysService.validate).not.toHaveBeenCalled();
  });

  it('serves initialize, tools/list and tools/call as raw JSON-RPC', async () => {
    const init = await rpc()
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
      })
      .expect(200);
    expect(init.body).toEqual(expect.objectContaining({ jsonrpc: '2.0', id: 1 }));
    expect(init.body.result.serverInfo.name).toBe('boardupscale');

    const list = await rpc()
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
      .expect(200);
    expect(list.body.result.tools.map((t: any) => t.name)).toContain('list_my_issues');

    const who = await rpc()
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'whoami', arguments: {} } })
      .expect(200);
    expect(JSON.parse(who.body.result.content[0].text)).toEqual(
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
    );
  });

  it('returns 405 for GET (stateless server, no SSE stream)', async () => {
    await request(app.getHttpServer()).get('/api/mcp').expect(405);
  });
});
