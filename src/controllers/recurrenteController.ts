import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { Frecuencia } from '@prisma/client'

function calcularProxima(frecuencia: Frecuencia, desde: Date): Date {
  const d = new Date(desde)
  switch (frecuencia) {
    case 'DIARIA':   d.setDate(d.getDate() + 1); break
    case 'SEMANAL':  d.setDate(d.getDate() + 7); break
    case 'MENSUAL': {
      const day = d.getDate()
      d.setDate(1)
      d.setMonth(d.getMonth() + 1)
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      d.setDate(Math.min(day, lastDay))
      break
    }
    case 'ANUAL':    d.setFullYear(d.getFullYear() + 1); break
  }
  return d
}

export const listarRecurrentes = async (req: AuthRequest, res: Response): Promise<void> => {
  const recurrentes = await prisma.transaccionRecurrente.findMany({
    where: { usuarioId: req.usuarioId },
    include: { categoria: true, cuenta: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json(recurrentes)
}

export const crearRecurrente = async (req: AuthRequest, res: Response): Promise<void> => {
  const { nombre, monto, tipo, categoriaId, cuentaId, frecuencia, fechaInicio } = req.body
  if (!nombre || !monto || !tipo || !categoriaId || !frecuencia) {
    res.status(400).json({ error: 'Faltan campos requeridos' })
    return
  }
  const montoNum = parseFloat(monto)
  if (isNaN(montoNum) || montoNum <= 0) {
    res.status(400).json({ error: 'Monto inválido' }); return
  }
  const inicio = fechaInicio ? new Date(fechaInicio) : new Date()
  inicio.setHours(0, 0, 0, 0)

  const recurrente = await prisma.transaccionRecurrente.create({
    data: {
      nombre,
      monto: montoNum,
      tipo,
      categoriaId,
      cuentaId: cuentaId || null,
      frecuencia,
      proximaFecha: inicio,
      usuarioId: req.usuarioId!,
    },
    include: { categoria: true, cuenta: true },
  })
  res.status(201).json(recurrente)
}

export const toggleActiva = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const recurrente = await prisma.transaccionRecurrente.findFirst({
    where: { id, usuarioId: req.usuarioId },
  })
  if (!recurrente) { res.status(404).json({ error: 'No encontrada' }); return }
  const updated = await prisma.transaccionRecurrente.update({
    where: { id },
    data: { activa: !recurrente.activa },
  })
  res.json(updated)
}

export const eliminarRecurrente = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const result = await prisma.transaccionRecurrente.deleteMany({
    where: { id, usuarioId: req.usuarioId },
  })
  if (result.count === 0) { res.status(404).json({ error: 'No encontrada' }); return }
  res.json({ ok: true })
}

export const procesarRecurrentes = async (req: AuthRequest, res: Response): Promise<void> => {
  const ahora = new Date()
  const pendientes = await prisma.transaccionRecurrente.findMany({
    where: {
      usuarioId: req.usuarioId,
      activa: true,
      proximaFecha: { lte: ahora },
    },
    include: { categoria: true },
  })

  let procesadas = 0
  for (const r of pendientes) {
    await prisma.transaccion.create({
      data: {
        monto: r.monto,
        descripcion: r.nombre,
        tipo: r.tipo,
        categoriaId: r.categoriaId,
        cuentaId: r.cuentaId,
        usuarioId: r.usuarioId,
        fecha: new Date(),
      },
    })

    if (r.cuentaId) {
      await prisma.cuenta.updateMany({
        where: { id: r.cuentaId, usuarioId: r.usuarioId },
        data:
          r.tipo === 'INGRESO'
            ? { saldo: { increment: r.monto } }
            : { saldo: { decrement: r.monto } },
      })
    }

    await prisma.transaccionRecurrente.update({
      where: { id: r.id },
      data: { proximaFecha: calcularProxima(r.frecuencia, ahora) },
    })
    procesadas++
  }

  res.json({ procesadas })
}
