import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

export const obtenerCategorias = async (req: AuthRequest, res: Response): Promise<void> => {
  const { tipo } = req.query
  const categorias = await prisma.categoria.findMany({
    where: { usuarioId: req.usuarioId, ...(tipo ? { tipo: tipo as 'INGRESO' | 'GASTO' } : {}) },
    orderBy: { nombre: 'asc' }
  })
  res.json(categorias)
}

export const crearCategoria = async (req: AuthRequest, res: Response): Promise<void> => {
  const { nombre, color, icono, tipo } = req.body
  if (!nombre || !tipo) {
    res.status(400).json({ error: 'Nombre y tipo son requeridos' })
    return
  }
  const categoria = await prisma.categoria.create({
    data: { nombre, color: color ?? '#6366f1', icono: icono ?? 'circle', tipo, usuarioId: req.usuarioId! }
  })
  res.status(201).json(categoria)
}

export const actualizarCategoria = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const { nombre, color, icono } = req.body
  const result = await prisma.categoria.updateMany({
    where: { id, usuarioId: req.usuarioId },
    data: { nombre, color, icono }
  })
  if (result.count === 0) { res.status(404).json({ error: 'Categoría no encontrada' }); return }
  res.json({ ok: true })
}

export const eliminarCategoria = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const categoria = await prisma.categoria.findFirst({ where: { id, usuarioId: req.usuarioId } })
  if (!categoria) { res.status(404).json({ error: 'Categoría no encontrada' }); return }

  const enUso = await prisma.transaccion.count({ where: { categoriaId: id } })
  if (enUso > 0) {
    res.status(400).json({ error: 'No puedes eliminar una categoría con transacciones asociadas' }); return
  }

  await prisma.categoria.deleteMany({ where: { id, usuarioId: req.usuarioId! } })
  res.json({ ok: true })
}
