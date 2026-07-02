import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GlobalSearchQueryDto } from '@/modules/search/dto/global-search-query.dto';
import { SearchSimilarQueryDto } from '@/modules/search/dto/search-similar-query.dto';

describe('GlobalSearchQueryDto', () => {
  it('accepts a valid query', async () => {
    const dto = plainToInstance(GlobalSearchQueryDto, { q: 'login', limit: 5 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.q).toBe('login');
    expect(dto.limit).toBe(5);
  });

  it('trims whitespace from q', async () => {
    const dto = plainToInstance(GlobalSearchQueryDto, { q: '  test  ' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.q).toBe('test');
  });

  it('rejects empty q', async () => {
    const dto = plainToInstance(GlobalSearchQueryDto, { q: '   ' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects limit above max', async () => {
    const dto = plainToInstance(GlobalSearchQueryDto, { q: 'test', limit: 100 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('SearchSimilarQueryDto', () => {
  it('accepts valid similar search input', async () => {
    const dto = plainToInstance(SearchSimilarQueryDto, {
      text: 'fix login bug',
      excludeIssueId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects text shorter than minimum', async () => {
    const dto = plainToInstance(SearchSimilarQueryDto, { text: 'abc' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid excludeIssueId', async () => {
    const dto = plainToInstance(SearchSimilarQueryDto, {
      text: 'fix login bug',
      excludeIssueId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
