import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

export const obtenerAlertas = async (req: AuthRequest, res: Response): Promise<void> => {
  const alertas = await prisma.alerta.findMany({
    where: { usuarioId: req.usuarioId },
    orderBy: { createdAt: 'desc' },
    take: 50
  })
  res.json(alertas)
}

export const marcarLeida = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const result = await prisma.alerta.updateMany({ where: { id, usuarioId: req.usuarioId }, data: { leida: true } })
  if (result.count === 0) { res.status(404).json({ error: 'Alerta no encontrada' }); return }
  res.json({ ok: true })
}

export const marcarTodasLeidas = async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.alerta.updateMany({ where: { usuarioId: req.usuarioId, leida: false }, data: { leida: true } })
  res.json({ ok: true })
}
