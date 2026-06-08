import { Request } from 'express'
import { prisma } from './prisma'

export const getIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()) ?? req.ip ?? 'desconocida'

export const audit = (usuarioId: string | null, accion: string, ip: string, detalle?: string): void => {
  prisma.auditLog.create({ data: { usuarioId, accion, ip, detalle: detalle ?? null } }).catch(() => {})
}
