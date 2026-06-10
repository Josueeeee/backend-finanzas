import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

// Despierta Neon DB en el primer request — sin auth requerida
router.get('/', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default router
