
import { logger } from './logger';

declare const describe: any;
declare const test: any;
declare const expect: any;

describe('Logger PII Masking', () => {
  test('Masks Email', () => {
    const output = logger.maskPII('Contact user@example.com for support');
    expect(output).toContain('us***@example.com');
    expect(output).not.toContain('user@example.com');
  });

  test('Masks Phone', () => {
    const output = logger.maskPII('Call +15551234567');
    expect(output).toContain('+1555****67');
    expect(output).not.toContain('1234');
  });

  test('Masks App Tokens (pk-)', () => {
    const output = logger.maskPII('Use token pk-abc12345xyz');
    expect(output).toContain('pk-abc********');
    expect(output).not.toContain('12345');
  });

  test('Masks Google API Keys (AIza)', () => {
    const output = logger.maskPII('Config: AIzaSyTestKey123456');
    expect(output).toContain('AIzaSyTes********');
    expect(output).not.toContain('tKey123');
  });

  test('Masks Nested Object Keys', () => {
    const obj = {
      user: {
        email: 'test@test.com',
        apiKey: 'AIzaSecret',
      },
      secretToken: 'sensitive'
    };
    const output = logger.maskPII(obj);
    expect(output.user.email).toContain('te***@test.com');
    expect(output.user.apiKey).toBe('********'); // matched by key name 'key'
    expect(output.secretToken).toBe('********'); // matched by key name 'token'
  });
});
