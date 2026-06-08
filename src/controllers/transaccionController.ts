import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { enviarPush } from '../lib/push'
import { audit, getIp } from '../lib/audit'

export const obtenerTransacciones = async (req: AuthRequest, res: Response): Promise<void> => {
  const { mes, anio, categoriaId, tipo } = req.query
  const where: Record<string, unknown> = { usuarioId: req.usuarioId }
  if (tipo) where.tipo = tipo
  if (categoriaId) where.categoriaId = categoriaId as string
  if (mes && anio) {
    const inicio = new Date(Number(anio), Number(mes) - 1, 1)
    const fin = new Date(Number(anio), Number(mes), 0, 23, 59, 59)
    where.fecha = { gte: inicio, lte: fin }
  }
  const transacciones = await prisma.transaccion.findMany({
    where,
    include: { categoria: true, cuenta: true },
    orderBy: { fecha: 'desc' },
    take: 100,
  })
  res.json(transacciones)
}

export const crearTransaccion = async (req: AuthRequest, res: Response): Promise<void> => {
  const { monto, descripcion, fecha, tipo, categoriaId, cuentaId } = req.body
  if (!monto || !tipo || !categoriaId) {
    res.status(400).json({ error: 'Monto, tipo y categoría son requeridos' })
    return
  }

  if (descripcion && descripcion.length > 500) {
    res.status(400).json({ error: 'Descripción demasiado larga (máx 500 caracteres)' }); return
  }
  const montoNum = parseFloat(monto)
  if (isNaN(montoNum) || montoNum <= 0) {
    res.status(400).json({ error: 'Monto inválido' }); return
  }
  const fechaObj = fecha ? new Date(fecha) : new Date()
  if (isNaN(fechaObj.getTime())) {
    res.status(400).json({ error: 'Fecha inválida' }); return
  }

  const transaccion = await prisma.transaccion.create({
    data: {
      monto: montoNum,
      descripcion,
      fecha: fechaObj,
      tipo,
      categoriaId,
      cuentaId: cuentaId || null,
      usuarioId: req.usuarioId!,
    },
    include: { categoria: true },
  })

  // Actualizar saldo de cuenta
  if (cuentaId) {
    await prisma.cuenta.updateMany({
      where: { id: cuentaId, usuarioId: req.usuarioId! },
      data:
        tipo === 'INGRESO'
          ? { saldo: { increment: montoNum } }
          : { saldo: { decrement: montoNum } },
    })
  }

  // Verificar presupuesto si es GASTO
  if (tipo === 'GASTO') {
    const ahora = new Date()
    const presupuesto = await prisma.presupuesto.findUnique({
      where: {
        usuarioId_categoriaId_mes_anio: {
          usuarioId: req.usuarioId!,
          categoriaId,
          mes: ahora.getMonth() + 1,
          anio: ahora.getFullYear(),
        },
      },
    })
    if (presupuesto) {
      const gastos = await prisma.transaccion.aggregate({
        where: {
          usuarioId: req.usuarioId!,
          categoriaId,
          tipo: 'GASTO',
          fecha: {
            gte: new Date(ahora.getFullYear(), ahora.getMonth(), 1),
            lte: new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0),
          },
        },
        _sum: { monto: true },
      })
      const totalGastado = gastos._sum.monto ?? 0
      const porcentaje = (totalGastado / presupuesto.limite) * 100

      let mensajePush: string | null = null
      let tipoPush: string | null = null

      if (porcentaje >= 100) {
        const alertaExiste = await prisma.alerta.findFirst({
          where: {
            usuarioId: req.usuarioId!,
            presupuestoId: presupuesto.id,
            tipo: 'PRESUPUESTO_100',
            createdAt: { gte: new Date(ahora.getFullYear(), ahora.getMonth(), 1) },
          },
        })
        if (!alertaExiste) {
          await prisma.alerta.create({
            data: {
              tipo: 'PRESUPUESTO_100',
              mensaje: `Has superado el presupuesto de ${transaccion.categoria.nombre} este mes`,
              usuarioId: req.usuarioId!,
              presupuestoId: presupuesto.id,
            },
          })
          mensajePush = `Has superado el presupuesto de ${transaccion.categoria.nombre} este mes`
          tipoPush = '⚠️ Límite superado'
        }
      } else if (porcentaje >= 80) {
        const alertaExiste = await prisma.alerta.findFirst({
          where: {
            usuarioId: req.usuarioId!,
            presupuestoId: presupuesto.id,
            tipo: 'PRESUPUESTO_80',
            createdAt: { gte: new Date(ahora.getFullYear(), ahora.getMonth(), 1) },
          },
        })
        if (!alertaExiste) {
          await prisma.alerta.create({
            data: {
              tipo: 'PRESUPUESTO_80',
              mensaje: `Has usado el ${Math.round(porcentaje)}% del presupuesto de ${transaccion.categoria.nombre}`,
              usuarioId: req.usuarioId!,
              presupuestoId: presupuesto.id,
            },
          })
          mensajePush = `Has usado el ${Math.round(porcentaje)}% del presupuesto de ${transaccion.categoria.nombre}`
          tipoPush = '📊 Alerta de presupuesto'
        }
      }

      if (mensajePush) {
        const usuario = await prisma.usuario.findUnique({
          where: { id: req.usuarioId! },
          select: { pushToken: true },
        })
        if (usuario?.pushToken) {
          await enviarPush(usuario.pushToken, tipoPush!, mensajePush)
        }
      }
    }
  }

  res.status(201).json(transaccion)
}

export const actualizarTransaccion = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const { monto, descripcion, fecha, categoriaId } = req.body
  const updateData: Record<string, unknown> = { descripcion, categoriaId }
  if (monto !== undefined) {
    const montoNum = parseFloat(monto)
    if (isNaN(montoNum) || montoNum <= 0) { res.status(400).json({ error: 'Monto inválido' }); return }
    updateData.monto = montoNum
  }
  if (fecha !== undefined) {
    const fechaObj = new Date(fecha)
    if (isNaN(fechaObj.getTime())) { res.status(400).json({ error: 'Fecha inválida' }); return }
    updateData.fecha = fechaObj
  }

  const transaccion = await prisma.transaccion.updateMany({
    where: { id, usuarioId: req.usuarioId },
    data: updateData,
  })
  if (transaccion.count === 0) {
    res.status(404).json({ error: 'Transacción no encontrada' })
    return
  }
  res.json({ ok: true })
}

export const eliminarTransaccion = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const transaccion = await prisma.transaccion.findFirst({ where: { id, usuarioId: req.usuarioId } })
  if (!transaccion) { res.status(404).json({ error: 'Transacción no encontrada' }); return }

  await prisma.transaccion.deleteMany({ where: { id, usuarioId: req.usuarioId! } })
  audit(req.usuarioId!, 'ELIMINAR_TRANSACCION', getIp(req), `id:${id} monto:${transaccion.monto} tipo:${transaccion.tipo}`)

  if (transaccion.cuentaId) {
    await prisma.cuenta.updateMany({
      where: { id: transaccion.cuentaId, usuarioId: req.usuarioId! },
      data:
        transaccion.tipo === 'INGRESO'
          ? { saldo: { decrement: transaccion.monto } }
          : { saldo: { increment: transaccion.monto } },
    })
  }

  res.json({ ok: true })
}
