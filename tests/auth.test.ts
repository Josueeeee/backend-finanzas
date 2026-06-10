import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'

const mockUsuario = {
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}
const mockCategoria = { createMany: vi.fn().mockResolvedValue({ count: 11 }) }
const mockRefreshToken = {
  create: vi.fn().mockResolvedValue({ id: 'rt1' }),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}
const mockAuditLog = { create: vi.fn().mockResolvedValue({}) }

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    usuario: mockUsuario,
    categoria: mockCategoria,
    refreshToken: mockRefreshToken,
    auditLog: mockAuditLog,
  },
}))

const { app } = await import('../src/app')

const usuarioBase = {
  id: 'u1',
  nombre: 'Test',
  email: 'test@test.com',
  password: await bcrypt.hash('password123', 10),
  moneda: 'HNL',
  loginIntentos: 0,
  bloqueadoHasta: null,
}

describe('POST /api/auth/registro', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 si faltan campos', async () => {
    const res = await request(app).post('/api/auth/registro').send({ nombre: 'Test' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/requeridos/)
  })

  it('400 si email inválido', async () => {
    const res = await request(app).post('/api/auth/registro').send({ nombre: 'Test', email: 'no-es-email', password: 'password123' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/[Ii]nválido/)
  })

  it('400 si contraseña < 8 chars', async () => {
    const res = await request(app).post('/api/auth/registro').send({ nombre: 'Test', email: 'a@b.com', password: '123' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/8 caracteres/)
  })

  it('409 si email ya existe', async () => {
    mockUsuario.findUnique.mockResolvedValueOnce(usuarioBase)
    const res = await request(app).post('/api/auth/registro').send({ nombre: 'Test', email: 'test@test.com', password: 'password123' })
    expect(res.status).toBe(409)
  })

  it('201 con registro exitoso', async () => {
    mockUsuario.findUnique.mockResolvedValueOnce(null)
    mockUsuario.create.mockResolvedValueOnce({ id: 'u2', nombre: 'Test', email: 'nuevo@test.com', moneda: 'HNL' })
    const res = await request(app).post('/api/auth/registro').send({ nombre: 'Test', email: 'nuevo@test.com', password: 'password123' })
    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
    expect(res.body.refreshToken).toBeDefined()
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 si faltan campos', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com' })
    expect(res.status).toBe(400)
  })

  it('401 si usuario no existe', async () => {
    mockUsuario.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/api/auth/login').send({ email: 'no@existe.com', password: 'password123' })
    expect(res.status).toBe(401)
  })

  it('429 si cuenta bloqueada', async () => {
    mockUsuario.findUnique.mockResolvedValueOnce({
      ...usuarioBase,
      bloqueadoHasta: new Date(Date.now() + 10 * 60 * 1000),
    })
    const res = await request(app).post('/api/auth/login').send({ email: 'test@test.com', password: 'password123' })
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/bloqueada/)
  })

  it('401 si contraseña incorrecta', async () => {
    mockUsuario.findUnique.mockResolvedValueOnce(usuarioBase)
    mockUsuario.update.mockResolvedValueOnce({})
    const res = await request(app).post('/api/auth/login').send({ email: 'test@test.com', password: 'wrongpassword' })
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/[Cc]redenciales/)
  })

  it('200 con login exitoso', async () => {
    mockUsuario.findUnique.mockResolvedValueOnce(usuarioBase)
    mockUsuario.update.mockResolvedValueOnce({})
    const res = await request(app).post('/api/auth/login').send({ email: 'test@test.com', password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.refreshToken).toBeDefined()
  })
})

describe('POST /api/auth/refresh', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 si no hay refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({})
    expect(res.status).toBe(401)
  })

  it('401 si refresh token inválido', async () => {
    mockRefreshToken.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'fake-token' })
    expect(res.status).toBe(401)
  })
})
