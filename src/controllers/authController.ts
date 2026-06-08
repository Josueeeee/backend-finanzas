import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { env } from '../config/env'
import { AuthRequest } from '../middleware/auth'
import { audit, getIp } from '../lib/audit'

const REFRESH_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000

const hashToken = (raw: string): string =>
  crypto.createHash('sha256').update(raw).digest('hex')

const generarTokens = async (usuarioId: string): Promise<{ token: string; refreshToken: string }> => {
  const token = jwt.sign({ usuarioId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn, algorithm: 'HS256' })
  const raw = crypto.randomBytes(40).toString('hex')
  await prisma.refreshToken.create({
    data: {
      token: hashToken(raw),
      usuarioId,
      expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
    },
  })
  return { token, refreshToken: raw }
}

export const registro = async (req: Request, res: Response): Promise<void> => {
  const { nombre, email, password } = req.body
  if (!nombre || !email || !password) {
    res.status(400).json({ error: 'Todos los campos son requeridos' })
    return
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: 'Email inválido' })
    return
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    return
  }
  const existe = await prisma.usuario.findUnique({ where: { email } })
  if (existe) {
    res.status(409).json({ error: 'Email ya registrado' })
    return
  }
  const hash = await bcrypt.hash(password, 10)
  const usuario = await prisma.usuario.create({
    data: { nombre, email, password: hash },
    select: { id: true, nombre: true, email: true, moneda: true },
  })
  await prisma.categoria.createMany({
    data: [
      { nombre: 'Alimentación', color: '#f97316', icono: 'utensils', tipo: 'GASTO', usuarioId: usuario.id },
      { nombre: 'Transporte', color: '#3b82f6', icono: 'car', tipo: 'GASTO', usuarioId: usuario.id },
      { nombre: 'Salud', color: '#ef4444', icono: 'heart', tipo: 'GASTO', usuarioId: usuario.id },
      { nombre: 'Entretenimiento', color: '#8b5cf6', icono: 'gamepad', tipo: 'GASTO', usuarioId: usuario.id },
      { nombre: 'Educación', color: '#06b6d4', icono: 'book', tipo: 'GASTO', usuarioId: usuario.id },
      { nombre: 'Hogar', color: '#84cc16', icono: 'home', tipo: 'GASTO', usuarioId: usuario.id },
      { nombre: 'Ropa', color: '#ec4899', icono: 'shirt', tipo: 'GASTO', usuarioId: usuario.id },
      { nombre: 'Otros gastos', color: '#6b7280', icono: 'more-horizontal', tipo: 'GASTO', usuarioId: usuario.id },
      { nombre: 'Salario', color: '#10b981', icono: 'briefcase', tipo: 'INGRESO', usuarioId: usuario.id },
      { nombre: 'Freelance', color: '#14b8a6', icono: 'laptop', tipo: 'INGRESO', usuarioId: usuario.id },
      { nombre: 'Otros ingresos', color: '#a3e635', icono: 'plus-circle', tipo: 'INGRESO', usuarioId: usuario.id },
    ],
  })
  const tokens = await generarTokens(usuario.id)
  audit(usuario.id, 'REGISTRO', getIp(req), email)
  res.status(201).json({ usuario, ...tokens })
}

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Email y contraseña requeridos' })
    return
  }
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario) {
    res.status(401).json({ error: 'Credenciales inválidas' })
    return
  }

  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
    const minutosRestantes = Math.ceil((usuario.bloqueadoHasta.getTime() - Date.now()) / 60000)
    audit(usuario.id, 'CUENTA_BLOQUEADA', getIp(req), `Intento mientras bloqueada — ${minutosRestantes} min restantes`)
    res.status(429).json({ error: `Cuenta bloqueada. Intenta en ${minutosRestantes} minuto${minutosRestantes !== 1 ? 's' : ''}` })
    return
  }

  const passwordValida = await bcrypt.compare(password, usuario.password)
  if (!passwordValida) {
    const intentos = usuario.loginIntentos + 1
    const bloqueadoHasta = intentos >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { loginIntentos: intentos, ...(bloqueadoHasta && { bloqueadoHasta }) },
    })
    audit(usuario.id, bloqueadoHasta ? 'LOGIN_BLOQUEADO' : 'LOGIN_FALLIDO', getIp(req), `Intento ${intentos}/5`)
    if (bloqueadoHasta) {
      res.status(429).json({ error: 'Cuenta bloqueada por 15 minutos por demasiados intentos fallidos' })
    } else {
      res.status(401).json({ error: `Credenciales inválidas (${intentos}/5 intentos)` })
    }
    return
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { loginIntentos: 0, bloqueadoHasta: null },
  })

  const tokens = await generarTokens(usuario.id)
  audit(usuario.id, 'LOGIN', getIp(req))
  res.json({
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, moneda: usuario.moneda },
    ...tokens,
  })
}

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body
  if (!refreshToken) { res.status(401).json({ error: 'Refresh token requerido' }); return }

  const stored = await prisma.refreshToken.findUnique({ where: { token: hashToken(refreshToken) } })
  if (!stored || stored.revocado || stored.expiresAt < new Date()) {
    res.status(401).json({ error: 'Refresh token inválido o expirado' })
    return
  }

  // Rotate: revoke old, issue new
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revocado: true } })
  const tokens = await generarTokens(stored.usuarioId)
  audit(stored.usuarioId, 'TOKEN_REFRESH', getIp(req))
  res.json(tokens)
}

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  const { refreshToken } = req.body
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { token: hashToken(refreshToken), usuarioId: req.usuarioId! },
      data: { revocado: true },
    })
  }
  audit(req.usuarioId!, 'LOGOUT', getIp(req))
  res.json({ ok: true })
}

export const perfil = async (req: Request & { usuarioId?: string }, res: Response): Promise<void> => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuarioId },
    select: { id: true, nombre: true, email: true, moneda: true, createdAt: true },
  })
  res.json(usuario)
}

export const actualizarPerfil = async (req: AuthRequest, res: Response): Promise<void> => {
  const { nombre } = req.body
  if (!nombre?.trim()) { res.status(400).json({ error: 'Nombre requerido' }); return }
  const usuario = await prisma.usuario.update({
    where: { id: req.usuarioId! },
    data: { nombre: nombre.trim() },
    select: { id: true, nombre: true, email: true, moneda: true },
  })
  res.json(usuario)
}

export const guardarPushToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const { token } = req.body
  if (!token) { res.status(400).json({ error: 'Token requerido' }); return }
  await prisma.usuario.update({
    where: { id: req.usuarioId! },
    data: { pushToken: token },
  })
  res.json({ ok: true })
}
