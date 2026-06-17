import { NotFoundException } from '@nestjs/common';
import { ResolveProjectPipe } from './resolve-project.pipe';

describe('ResolveProjectPipe', () => {
  const mockRequest = { user: { organizationId: 'org-1' } };
  let pipe: ResolveProjectPipe;
  let dataSource: { query: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    pipe = new ResolveProjectPipe(dataSource as any, mockRequest as any);
  });

  it('should pass through UUIDs unchanged', async () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    await expect(pipe.transform(uuid)).resolves.toBe(uuid);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('should resolve project key via current key or alias', async () => {
    dataSource.query.mockResolvedValue([{ id: 'project-uuid' }]);

    await expect(pipe.transform('myproj')).resolves.toBe('project-uuid');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('project_key_aliases'),
      ['org-1', 'MYPROJ'],
    );
  });

  it('should throw NotFoundException when key not found', async () => {
    dataSource.query.mockResolvedValue([]);

    await expect(pipe.transform('UNKNOWN')).rejects.toThrow(NotFoundException);
  });

  it('should return undefined for empty value', async () => {
    await expect(pipe.transform(undefined)).resolves.toBeUndefined();
  });
});
