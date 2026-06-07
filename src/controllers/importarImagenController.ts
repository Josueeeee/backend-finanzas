import { Response } from 'express'
import Groq from 'groq-sdk'
import multer from 'multer'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

export const uploadImagen = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, file.mimetype.startsWith('image/')),
})

interface TransaccionExtraida {
  monto: number
  descripcion: string
  fecha: string
  tipo: 'GASTO' | 'INGRESO'
  categoriaNombre: string
  categoriaId: string | null
  categoriaReal: string
}

export const importarImagen = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'Se requiere una imagen' }); return }
  if (!process.env.GROQ_API_KEY) { res.status(500).json({ error: 'GROQ_API_KEY no configurada' }); return }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  const categorias = await prisma.categoria.findMany({ where: { usuarioId: req.usuarioId! } })
  const catGasto = categorias.filter(c => c.tipo === 'GASTO').map(c => c.nombre).join(', ')
  const catIngreso = categorias.filter(c => c.tipo === 'INGRESO').map(c => c.nombre).join(', ')

  const base64 = req.file.buffer.toString('base64')
  const mimeType = req.file.mimetype

  const response = await groq.chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` }
          },
          {
            type: 'text',
            text: `Eres un asistente que extrae transacciones bancarias de capturas de pantalla de apps bancarias.

Categorías de GASTO disponibles: ${catGasto}
Categorías de INGRESO disponibles: ${catIngreso}

Extrae TODAS las transacciones visibles en la imagen. Responde ÚNICAMENTE con JSON válido sin texto adicional:
{"transacciones":[{"monto":150.00,"descripcion":"Descripción del movimiento","fecha":"2026-06-01","tipo":"GASTO","categoriaNombre":"Alimentación"}]}

Reglas:
- monto: número positivo (sin símbolo de moneda)
- tipo: "GASTO" para débitos/retiros/pagos/compras, "INGRESO" para créditos/depósitos/transferencias recibidas
- fecha: formato YYYY-MM-DD (usa la fecha visible en pantalla, si no hay usa hoy)
- categoriaNombre: elige la más apropiada de las listas dadas
- Si no hay transacciones claras: {"transacciones":[]}`
          }
        ]
      }
    ],
    max_tokens: 1500,
    temperature: 0.1,
  })

  const content = response.choices[0].message.content ?? ''
  let raw: Array<Record<string, unknown>> = []

  try {
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      raw = Array.isArray(parsed.transacciones) ? parsed.transacciones : []
    }
  } catch { /* devolver vacío */ }

  const transacciones: TransaccionExtraida[] = await Promise.all(
    raw.map(async (t) => {
      const tipo = (t.tipo === 'INGRESO' ? 'INGRESO' : 'GASTO') as 'GASTO' | 'INGRESO'
      const cat = await prisma.categoria.findFirst({
        where: {
          usuarioId: req.usuarioId!,
          nombre: { contains: String(t.categoriaNombre ?? ''), mode: 'insensitive' },
          tipo,
        }
      })
      return {
        monto: Number(t.monto) || 0,
        descripcion: String(t.descripcion ?? ''),
        fecha: String(t.fecha ?? new Date().toISOString().split('T')[0]),
        tipo,
        categoriaNombre: String(t.categoriaNombre ?? ''),
        categoriaId: cat?.id ?? null,
        categoriaReal: cat?.nombre ?? String(t.categoriaNombre ?? ''),
      }
    })
  )

  res.json({ transacciones })
}
