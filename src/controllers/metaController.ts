import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { enviarPush } from '../lib/push'

export const obtenerMetas = async (req: AuthRequest, res: Response): Promise<void> => {
  const metas = await prisma.meta.findMany({
    where: { usuarioId: req.usuarioId },
    orderBy: { createdAt: 'desc' },
  })
  res.json(metas)
}

export const crearMeta = async (req: AuthRequest, res: Response): Promise<void> => {
  const { nombre, montoObjetivo, fechaLimite, color } = req.body
  if (!nombre || !montoObjetivo) {
    res.status(400).json({ error: 'Nombre y monto objetivo son requeridos' })
    return
  }
  const montoObjetivoNum = parseFloat(montoObjetivo)
  if (isNaN(montoObjetivoNum) || montoObjetivoNum <= 0) {
    res.status(400).json({ error: 'Monto objetivo inválido' }); return
  }
  const meta = await prisma.meta.create({
    data: {
      nombre,
      montoObjetivo: montoObjetivoNum,
      fechaLimite: fechaLimite ? new Date(fechaLimite) : null,
      color: color ?? '#10b981',
      usuarioId: req.usuarioId!,
    },
  })
  res.status(201).json(meta)
}

export const aportarMeta = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const { monto } = req.body
  const montoNum = parseFloat(monto)
  if (!monto || isNaN(montoNum) || montoNum <= 0) {
    res.status(400).json({ error: 'Monto inválido' })
    return
  }
  const meta = await prisma.meta.findFirst({ where: { id, usuarioId: req.usuarioId } })
  if (!meta) { res.status(404).json({ error: 'Meta no encontrada' }); return }

  const nuevoMonto = Math.min(meta.montoActual + montoNum, meta.montoObjetivo)
  const completada = nuevoMonto >= meta.montoObjetivo

  const actualizada = await prisma.meta.update({
    where: { id },
    data: { montoActual: nuevoMonto, completada },
  })

  if (completada && !meta.completada) {
    await prisma.alerta.create({
      data: {
        tipo: 'META_COMPLETADA',
        mensaje: `¡Completaste tu meta "${meta.nombre}"! 🎉`,
        usuarioId: req.usuarioId!,
      },
    })
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuarioId! },
      select: { pushToken: true },
    })
    if (usuario?.pushToken) {
      await enviarPush(usuario.pushToken, '🎉 ¡Meta completada!', `Lograste tu meta "${meta.nombre}"`)
    }
  }

  res.json(actualizada)
}

export const eliminarMeta = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const result = await prisma.meta.deleteMany({ where: { id, usuarioId: req.usuarioId } })
  if (result.count === 0) { res.status(404).json({ error: 'Meta no encontrada' }); return }
  res.json({ ok: true })
}
