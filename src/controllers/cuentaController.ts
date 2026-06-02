import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

export const listarCuentas = async (req: AuthRequest, res: Response): Promise<void> => {
  const cuentas = await prisma.cuenta.findMany({
    where: { usuarioId: req.usuarioId },
    orderBy: { createdAt: 'asc' },
  })
  const patrimonio = cuentas.reduce((acc, c) => acc + c.saldo, 0)
  res.json({ cuentas, patrimonio })
}

export const crearCuenta = async (req: AuthRequest, res: Response): Promise<void> => {
  const { nombre, tipo, saldo, color } = req.body
  if (!nombre || !tipo) {
    res.status(400).json({ error: 'Nombre y tipo son requeridos' })
    return
  }
  const saldoNum = saldo ? parseFloat(saldo) : 0
  if (isNaN(saldoNum)) { res.status(400).json({ error: 'Saldo inválido' }); return }

  const cuenta = await prisma.cuenta.create({
    data: {
      nombre,
      tipo,
      saldo: saldoNum,
      color: color ?? '#7C3AED',
      usuarioId: req.usuarioId!,
    },
  })
  res.status(201).json(cuenta)
}

export const actualizarCuenta = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const { nombre, color } = req.body
  const result = await prisma.cuenta.updateMany({
    where: { id, usuarioId: req.usuarioId },
    data: { nombre, color },
  })
  if (result.count === 0) { res.status(404).json({ error: 'Cuenta no encontrada' }); return }
  res.json({ ok: true })
}

export const eliminarCuenta = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const transacciones = await prisma.transaccion.count({ where: { cuentaId: id, usuarioId: req.usuarioId } })
  if (transacciones > 0) {
    res.status(400).json({ error: 'No puedes eliminar una cuenta con transacciones asociadas' })
    return
  }
  const result = await prisma.cuenta.deleteMany({ where: { id, usuarioId: req.usuarioId } })
  if (result.count === 0) { res.status(404).json({ error: 'Cuenta no encontrada' }); return }
  res.json({ ok: true })
}
