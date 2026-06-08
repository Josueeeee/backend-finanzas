import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../lib/prisma'

export interface AuthRequest extends Request {
  usuarioId?: string
}

export const verificarToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token requerido' })
    return
  }
  const token = authHeader.split(' ')[1]
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as { usuarioId: string }
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.usuarioId }, select: { id: true } })
    if (!usuario) {
      res.status(401).json({ error: 'Token inválido' })
      return
    }
    req.usuarioId = payload.usuarioId
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido' })
  }
}
