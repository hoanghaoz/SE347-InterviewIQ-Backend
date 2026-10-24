import { Test } from '@nestjs/testing';
import { RedisService } from '../../../shared/infrastructure/redis/redis.service';
import { IPasswordResetOtpStore } from '../domain/repositories/password-reset-otp-store.interface';
import { RedisPasswordResetOtpStore } from './redis-password-reset-otp-store';

describe('RedisPasswordResetOtpStore', () => {
  const get = jest.fn();
  const set = jest.fn();
  const del = jest.fn();
  const ttl = jest.fn();
  const incrementWithTtl = jest.fn();

  const redisService = {
    get,
    set,
    del,
    ttl,
    incrementWithTtl,
  } as unknown as RedisService;
  const store = new RedisPasswordResetOtpStore(redisService);

  const key = 'auth:otp:reset-password:a@x.com';
  const attemptsKey = 'auth:otp:failed-attempts:reset-password:a@x.com';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // Logic đã được test ở RedisEmailOtpStore; ở đây chỉ cần chắc mọi key đều
  // nằm dưới reset-password, không đụng key của OTP đăng ký
  it('stores, reads, deletes and checks the otp under the reset-password key', async () => {
    set.mockResolvedValue(undefined);
    get.mockResolvedValue('hash');
    del.mockResolvedValue(undefined);
    ttl.mockResolvedValue(120);

    await store.saveOtp('  A@X.com ', 'hash', 300);
    await store.findOtp('a@x.com');
    await store.deleteOtp('a@x.com');
    await store.getRemainingTtl('a@x.com');

    expect(set).toHaveBeenCalledWith(key, 'hash', 300);
    expect(get).toHaveBeenCalledWith(key);
    expect(del).toHaveBeenCalledWith(key);
    expect(ttl).toHaveBeenCalledWith(key);
  });

  it('counts failed attempts separately from the register flow', async () => {
    incrementWithTtl.mockResolvedValue(1);
    del.mockResolvedValue(undefined);

    await store.incrementFailedAttempts('a@x.com', 300);
    await store.resetFailedAttempts('a@x.com');

    expect(incrementWithTtl).toHaveBeenCalledWith(attemptsKey, 300);
    expect(del).toHaveBeenCalledWith(attemptsKey);
  });

  it('is resolved by Nest DI with the constructor inherited from RedisEmailOtpStore', async () => {
    const module = await Test.createTestingModule({
      providers: [
        { provide: RedisService, useValue: redisService },
        {
          provide: IPasswordResetOtpStore,
          useClass: RedisPasswordResetOtpStore,
        },
      ],
    }).compile();
    set.mockResolvedValue(undefined);

    const resolved = module.get(IPasswordResetOtpStore);
    await resolved.saveOtp('a@x.com', 'hash', 300);

    expect(set).toHaveBeenCalledWith(key, 'hash', 300);
  });
});
