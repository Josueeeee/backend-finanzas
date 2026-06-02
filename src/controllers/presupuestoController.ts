import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

export const obtenerPresupuestos = async (req: AuthRequest, res: Response): Promise<void> => {
  const ahora = new Date()
  const mes = parseInt(req.query.mes as string) || ahora.getMonth() + 1
  const anio = parseInt(req.query.anio as string) || ahora.getFullYear()

  const presupuestos = await prisma.presupuesto.findMany({
    where: { usuarioId: req.usuarioId, mes, anio },
    include: { categoria: true }
  })

  // Calcular gastado por cada presupuesto
  const resultado = await Promise.all(presupuestos.map(async (p) => {
    const gastado = await prisma.transaccion.aggregate({
      where: {
        usuarioId: req.usuarioId!,
        categoriaId: p.categoriaId,
        tipo: 'GASTO',
        fecha: {
          gte: new Date(anio, mes - 1, 1),
          lte: new Date(anio, mes, 0, 23, 59, 59)
        }
      },
      _sum: { monto: true }
    })
    return { ...p, gastado: gastado._sum.monto ?? 0 }
  }))

  res.json(resultado)
}

export const crearPresupuesto = async (req: AuthRequest, res: Response): Promise<void> => {
  const { limite, mes, anio, categoriaId } = req.body
  if (!limite || !mes || !anio || !categoriaId) {
    res.status(400).json({ error: 'Todos los campos son requeridos' })
    return
  }
  const mesNum = parseInt(mes, 10)
  const anioNum = parseInt(anio, 10)
  const limiteNum = parseFloat(limite)
  if (isNaN(mesNum) || mesNum < 1 || mesNum > 12 || isNaN(anioNum) || anioNum < 2000 || isNaN(limiteNum) || limiteNum <= 0) {
    res.status(400).json({ error: 'Datos inválidos' }); return
  }

  const presupuesto = await prisma.presupuesto.upsert({
    where: { usuarioId_categoriaId_mes_anio: { usuarioId: req.usuarioId!, categoriaId, mes: mesNum, anio: anioNum } },
    create: { limite: limiteNum, mes: mesNum, anio: anioNum, categoriaId, usuarioId: req.usuarioId! },
    update: { limite: limiteNum },
    include: { categoria: true }
  })
  res.status(201).json(presupuesto)
}

export const eliminarPresupuesto = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const result = await prisma.presupuesto.deleteMany({ where: { id, usuarioId: req.usuarioId } })
  if (result.count === 0) { res.status(404).json({ error: 'Presupuesto no encontrado' }); return }
  res.json({ ok: true })
}

export const copiarPresupuesto = async (req: AuthRequest, res: Response): Promise<void> => {
  const { mes, anio } = req.body
  if (!mes || !anio) { res.status(400).json({ error: 'mes y anio son requeridos' }); return }

  const mesNum = parseInt(mes, 10)
  const anioNum = parseInt(anio, 10)
  if (isNaN(mesNum) || mesNum < 1 || mesNum > 12 || isNaN(anioNum) || anioNum < 2000) {
    res.status(400).json({ error: 'Mes o año inválido' }); return
  }

  // Previous month calculation
  const mesPrev = mesNum === 1 ? 12 : mesNum - 1
  const anioPrev = mesNum === 1 ? anioNum - 1 : anioNum

  const anteriores = await prisma.presupuesto.findMany({
    where: { usuarioId: req.usuarioId, mes: mesPrev, anio: anioPrev }
  })

  if (anteriores.length === 0) {
    res.status(404).json({ error: 'No hay presupuestos en el mes anterior' })
    return
  }

  const creados = await Promise.all(
    anteriores.map(p =>
      prisma.presupuesto.upsert({
        where: { usuarioId_categoriaId_mes_anio: { usuarioId: req.usuarioId!, categoriaId: p.categoriaId, mes: mesNum, anio: anioNum } },
        create: { limite: p.limite, mes: mesNum, anio: anioNum, categoriaId: p.categoriaId, usuarioId: req.usuarioId! },
        update: { limite: p.limite },
        include: { categoria: true }
      })
    )
  )

  res.status(201).json(creados)
}
