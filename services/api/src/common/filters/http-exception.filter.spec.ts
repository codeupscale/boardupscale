import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: any;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      url: '/api/test',
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it('should format HttpException correctly', () => {
    const exception = new HttpException('Something went wrong', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'Something went wrong',
      timestamp: expect.any(String),
      path: '/api/test',
    });
  });

  it('should handle NotFoundException', () => {
    const exception = new NotFoundException('User not found');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(jsonCall.message).toBe('User not found');
    expect(jsonCall.error).toBe('Not Found');
  });

  it('should handle UnauthorizedException', () => {
    const exception = new UnauthorizedException('Invalid token');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.error).toBe('Unauthorized');
  });

  it('should handle ForbiddenException', () => {
    const exception = new ForbiddenException('Access denied');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.error).toBe('Forbidden');
  });

  it('should handle validation errors (array of messages)', () => {
    const exception = new BadRequestException({
      message: ['email must be an email', 'password must be at least 8 characters'],
      error: 'Bad Request',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.message).toBe('Validation failed');
    expect(jsonCall.details).toEqual([
      'email must be an email',
      'password must be at least 8 characters',
    ]);
  });

  it('should handle generic Error (non-HttpException)', () => {
    const exception = new Error('Database connection failed');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.message).toBe('Database connection failed');
    expect(jsonCall.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('should handle unknown exceptions', () => {
    filter.catch('something unexpected', mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.message).toBe('Internal server error');
  });

  it('should include timestamp in error response', () => {
    const exception = new NotFoundException('Not found');

    filter.catch(exception, mockHost);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.timestamp).toBeDefined();
    // Verify it is a valid ISO date string
    expect(() => new Date(jsonCall.timestamp)).not.toThrow();
  });

  it('should include request path in error response', () => {
    mockRequest.url = '/api/issues/123';
    const exception = new NotFoundException('Issue not found');

    filter.catch(exception, mockHost);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.path).toBe('/api/issues/123');
  });

  it('should handle HttpException with string response', () => {
    const exception = new HttpException('Custom error message', HttpStatus.CONFLICT);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.message).toBe('Custom error message');
    expect(jsonCall.error).toBe('Conflict');
  });
});
