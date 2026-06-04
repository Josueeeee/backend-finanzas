import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'

export interface AuthRequest extends Request {
  usuarioId?: string
}

export const verificarToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token requerido' })
    return
  }
  const token = authHeader.split(' ')[1]
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as { usuarioId: string }
    req.usuarioId = payload.usuarioId
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido' })
  }
}
