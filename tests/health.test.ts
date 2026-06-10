import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}))

const { app } = await import('../src/app')

describe('GET /health', () => {
  it('devuelve status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.timestamp).toBeDefined()
  })
})
