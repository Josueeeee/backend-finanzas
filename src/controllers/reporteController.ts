import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

export const resumenMes = async (req: AuthRequest, res: Response): Promise<void> => {
  const ahora = new Date()
  const mes = parseInt(req.query.mes as string) || ahora.getMonth() + 1
  const anio = parseInt(req.query.anio as string) || ahora.getFullYear()
  const inicio = new Date(anio, mes - 1, 1)
  const fin = new Date(anio, mes, 0, 23, 59, 59)

  const [ingresos, gastos, transaccionesRecientes] = await Promise.all([
    prisma.transaccion.aggregate({
      where: { usuarioId: req.usuarioId!, tipo: 'INGRESO', fecha: { gte: inicio, lte: fin } },
      _sum: { monto: true }
    }),
    prisma.transaccion.aggregate({
      where: { usuarioId: req.usuarioId!, tipo: 'GASTO', fecha: { gte: inicio, lte: fin } },
      _sum: { monto: true }
    }),
    prisma.transaccion.findMany({
      where: { usuarioId: req.usuarioId!, fecha: { gte: inicio, lte: fin } },
      include: { categoria: true },
      orderBy: { fecha: 'desc' },
      take: 5
    })
  ])

  res.json({
    ingresos: ingresos._sum.monto ?? 0,
    gastos: gastos._sum.monto ?? 0,
    balance: (ingresos._sum.monto ?? 0) - (gastos._sum.monto ?? 0),
    transaccionesRecientes
  })
}

export const gastosPorCategoria = async (req: AuthRequest, res: Response): Promise<void> => {
  const ahora = new Date()
  const mes = parseInt(req.query.mes as string) || ahora.getMonth() + 1
  const anio = parseInt(req.query.anio as string) || ahora.getFullYear()
  const inicio = new Date(anio, mes - 1, 1)
  const fin = new Date(anio, mes, 0, 23, 59, 59)

  const gastos = await prisma.transaccion.groupBy({
    by: ['categoriaId'],
    where: { usuarioId: req.usuarioId!, tipo: 'GASTO', fecha: { gte: inicio, lte: fin } },
    _sum: { monto: true },
    orderBy: { _sum: { monto: 'desc' } }
  })

  const ids = gastos.map(g => g.categoriaId)
  const cats = await prisma.categoria.findMany({ where: { id: { in: ids } } })
  const catsMap = Object.fromEntries(cats.map(c => [c.id, c]))
  const resultado = gastos.map(g => ({ categoria: catsMap[g.categoriaId] ?? null, total: g._sum.monto ?? 0 }))

  res.json(resultado)
}

export const gastosPorCategoriaAnio = async (req: AuthRequest, res: Response): Promise<void> => {
  const anio = parseInt(req.query.anio as string) || new Date().getFullYear()
  const inicio = new Date(anio, 0, 1)
  const fin = new Date(anio, 11, 31, 23, 59, 59)

  const gastos = await prisma.transaccion.groupBy({
    by: ['categoriaId'],
    where: { usuarioId: req.usuarioId!, tipo: 'GASTO', fecha: { gte: inicio, lte: fin } },
    _sum: { monto: true },
    orderBy: { _sum: { monto: 'desc' } }
  })

  const ids = gastos.map(g => g.categoriaId)
  const cats = await prisma.categoria.findMany({ where: { id: { in: ids } } })
  const catsMap = Object.fromEntries(cats.map(c => [c.id, c]))
  const resultado = gastos.map(g => ({ categoria: catsMap[g.categoriaId] ?? null, total: g._sum.monto ?? 0 }))

  res.json(resultado)
}

export const tendenciaMensual = async (req: AuthRequest, res: Response): Promise<void> => {
  const anio = parseInt(req.query.anio as string) || new Date().getFullYear()
  const meses = await Promise.all(
    Array.from({ length: 12 }, (_, i) => i + 1).map(async (m) => {
      const inicio = new Date(anio, m - 1, 1)
      const fin = new Date(anio, m, 0, 23, 59, 59)
      const [ingresos, gastos] = await Promise.all([
        prisma.transaccion.aggregate({ where: { usuarioId: req.usuarioId!, tipo: 'INGRESO', fecha: { gte: inicio, lte: fin } }, _sum: { monto: true } }),
        prisma.transaccion.aggregate({ where: { usuarioId: req.usuarioId!, tipo: 'GASTO', fecha: { gte: inicio, lte: fin } }, _sum: { monto: true } })
      ])
      return { mes: m, ingresos: ingresos._sum.monto ?? 0, gastos: gastos._sum.monto ?? 0 }
    })
  )
  res.json(meses)
}
