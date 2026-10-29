// Production posture: ALLOW_PRIVATE_ADDRESSES is unset. A stubbed resolver
// returns a public address first (the pre-connect check) and a private
// address on the lookup that actually picks the socket.
import dns from 'node:dns/promises';
import { jest } from '@jest/globals';

import { ERROR_CODES } from '../src/errors.js';
import { fetchPublic } from '../src/fetchPage.js';

describe('fetchPublic DNS pinning', () => {
    let lookup;

    afterEach(() => {
        lookup?.mockRestore();
    });

    it.each([
        ['169.254.169.254', 4],
        ['::ffff:a9fe:a9fe', 6],
        ['10.0.0.1', 4],
    ])(
        'rejects when the second lookup returns %s and does not open a socket',
        async (address, family) => {
            let calls = 0;
            lookup = jest.spyOn(dns, 'lookup').mockImplementation(async () => {
                calls += 1;
                if (calls === 1) return [{ address: '1.1.1.1', family: 4 }];
                return [{ address, family }];
            });

            const started = Date.now();
            await expect(
                fetchPublic('http://rebind.example/', {
                    headers: {},
                    signal: AbortSignal.timeout(2000),
                })
            ).rejects.toMatchObject({ code: ERROR_CODES.BLOCKED_HOST });

            expect(calls).toBeGreaterThanOrEqual(2);
            expect(Date.now() - started).toBeLessThan(1500);
        }
    );

    it('validates every connect-time address and rejects the set when any is private', async () => {
        let calls = 0;
        lookup = jest.spyOn(dns, 'lookup').mockImplementation(async () => {
            calls += 1;
            if (calls === 1) return [{ address: '1.1.1.1', family: 4 }];
            return [
                { address: '1.1.1.1', family: 4 },
                { address: '2606:4700:4700::1111', family: 6 },
                { address: '127.0.0.1', family: 4 },
            ];
        });

        await expect(
            fetchPublic('http://rebind.example/mixed', {
                headers: {},
                signal: AbortSignal.timeout(2000),
            })
        ).rejects.toMatchObject({ code: ERROR_CODES.BLOCKED_HOST });
        expect(calls).toBeGreaterThanOrEqual(2);
    });
});
