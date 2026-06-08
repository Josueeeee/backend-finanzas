import { Router, Response } from 'express'
import { verificarToken, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'

const router = Router()

router.get('/', verificarToken, async (req: AuthRequest, res: Response): Promise<void> => {
  const logs = await prisma.auditLog.findMany({
    where: { usuarioId: req.usuarioId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  res.json(logs)
})

export default router
