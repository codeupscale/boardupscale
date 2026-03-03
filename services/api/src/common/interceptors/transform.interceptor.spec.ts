import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  function createMockCallHandler(value: any): CallHandler {
    return {
      handle: () => of(value),
    };
  }

  function createMockExecutionContext(): ExecutionContext {
    return {} as ExecutionContext;
  }

  it('should wrap plain response in { data: ... }', (done) => {
    const handler = createMockCallHandler({ name: 'Test' });

    interceptor.intercept(createMockExecutionContext(), handler).subscribe((result) => {
      expect(result).toEqual({ data: { name: 'Test' } });
      done();
    });
  });

  it('should wrap array response in { data: ... }', (done) => {
    const handler = createMockCallHandler([1, 2, 3]);

    interceptor.intercept(createMockExecutionContext(), handler).subscribe((result) => {
      expect(result).toEqual({ data: [1, 2, 3] });
      done();
    });
  });

  it('should not double-wrap when response already has data property', (done) => {
    const handler = createMockCallHandler({ data: { name: 'Test' }, meta: { total: 1 } });

    interceptor.intercept(createMockExecutionContext(), handler).subscribe((result) => {
      expect(result).toEqual({ data: { name: 'Test' }, meta: { total: 1 } });
      done();
    });
  });

  it('should not double-wrap when response has data key (even if data is null)', (done) => {
    const handler = createMockCallHandler({ data: null });

    interceptor.intercept(createMockExecutionContext(), handler).subscribe((result) => {
      expect(result).toEqual({ data: null });
      done();
    });
  });

  it('should wrap null value in { data: ... }', (done) => {
    const handler = createMockCallHandler(null);

    interceptor.intercept(createMockExecutionContext(), handler).subscribe((result) => {
      // null is not an object with 'data' key, so it gets wrapped
      expect(result).toEqual({ data: null });
      done();
    });
  });

  it('should wrap string value in { data: ... }', (done) => {
    const handler = createMockCallHandler('hello');

    interceptor.intercept(createMockExecutionContext(), handler).subscribe((result) => {
      expect(result).toEqual({ data: 'hello' });
      done();
    });
  });

  it('should wrap number value in { data: ... }', (done) => {
    const handler = createMockCallHandler(42);

    interceptor.intercept(createMockExecutionContext(), handler).subscribe((result) => {
      expect(result).toEqual({ data: 42 });
      done();
    });
  });
});
