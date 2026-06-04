import { Response, Request } from 'express'
import Groq from 'groq-sdk'
import multer from 'multer'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, file.mimetype.startsWith('audio/')),
})

function getGroq(): Groq {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY no configurada')
  return new Groq({ apiKey: process.env.GROQ_API_KEY })
}

type Msg = Groq.Chat.ChatCompletionMessageParam
const fmt = (n: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL' }).format(n)

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Groq.Chat.ChatCompletionTool[] = [
  // Transacciones
  {
    type: 'function',
    function: {
      name: 'crear_transaccion',
      description: 'Crea un gasto o ingreso. Úsalo cuando el usuario mencione que gastó, pagó, compró, recibió, cobró, depositó.',
      parameters: {
        type: 'object',
        properties: {
          monto: { type: 'number' },
          tipo: { type: 'string', enum: ['GASTO', 'INGRESO'] },
          descripcion: { type: 'string' },
          categoriaNombre: { type: 'string', description: 'Gastos: Alimentación, Transporte, Salud, Entretenimiento, Educación, Hogar, Ropa, Otros gastos. Ingresos: Salario, Freelance, Otros ingresos' }
        },
        required: ['monto', 'tipo', 'categoriaNombre']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'eliminar_ultima_transaccion',
      description: 'Elimina la última transacción registrada. Úsalo cuando el usuario diga "borra lo que acabo de registrar", "me equivoqué", "deshaz eso".',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'obtener_transacciones_recientes',
      description: 'Lista las últimas transacciones.',
      parameters: {
        type: 'object',
        properties: { limite: { type: 'number', description: 'Cuántas (máx 20, default 5)' } },
        required: []
      }
    }
  },
  // Reportes
  {
    type: 'function',
    function: {
      name: 'obtener_resumen',
      description: 'Resumen del mes: ingresos totales, gastos totales y balance.',
      parameters: {
        type: 'object',
        properties: {
          mes: { type: 'number', description: '1-12, default actual' },
          anio: { type: 'number' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'obtener_gastos_categoria',
      description: 'Desglose de gastos por categoría. Para "¿en qué gasté más?", "¿cuánto en comida?".',
      parameters: {
        type: 'object',
        properties: { mes: { type: 'number' }, anio: { type: 'number' } },
        required: []
      }
    }
  },
  // Presupuestos
  {
    type: 'function',
    function: {
      name: 'obtener_presupuestos',
      description: 'Lista presupuestos del mes con cuánto se ha gastado de cada uno.',
      parameters: {
        type: 'object',
        properties: { mes: { type: 'number' }, anio: { type: 'number' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'crear_presupuesto',
      description: 'Crea o actualiza un presupuesto para una categoría. "ponme un presupuesto de X para comida", "limita mis gastos de transporte a X".',
      parameters: {
        type: 'object',
        properties: {
          categoriaNombre: { type: 'string' },
          limite: { type: 'number', description: 'Monto máximo en HNL' },
          mes: { type: 'number', description: 'Default mes actual' },
          anio: { type: 'number' }
        },
        required: ['categoriaNombre', 'limite']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'eliminar_presupuesto',
      description: 'Elimina el presupuesto de una categoría.',
      parameters: {
        type: 'object',
        properties: {
          categoriaNombre: { type: 'string' },
          mes: { type: 'number' },
          anio: { type: 'number' }
        },
        required: ['categoriaNombre']
      }
    }
  },
  // Metas
  {
    type: 'function',
    function: {
      name: 'obtener_metas',
      description: 'Lista metas de ahorro con su progreso.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'crear_meta',
      description: 'Crea una meta de ahorro. "quiero ahorrar X para Y", "crea una meta de ahorro".',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          objetivo: { type: 'number', description: 'Monto objetivo en HNL' },
          fechaLimite: { type: 'string', description: 'Fecha ISO opcional, ej: 2025-12-31' }
        },
        required: ['nombre', 'objetivo']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'aportar_meta',
      description: 'Agrega dinero a una meta de ahorro. "aporta X a mi meta de Y", "añade X a mis ahorros".',
      parameters: {
        type: 'object',
        properties: {
          nombreMeta: { type: 'string' },
          monto: { type: 'number' }
        },
        required: ['nombreMeta', 'monto']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'eliminar_meta',
      description: 'Elimina una meta de ahorro.',
      parameters: {
        type: 'object',
        properties: { nombreMeta: { type: 'string' } },
        required: ['nombreMeta']
      }
    }
  },
  // Cuentas
  {
    type: 'function',
    function: {
      name: 'obtener_cuentas',
      description: 'Lista cuentas del usuario con su saldo actual y patrimonio total.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'crear_cuenta',
      description: 'Crea una cuenta bancaria, de efectivo, tarjeta o ahorro.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          tipo: { type: 'string', enum: ['EFECTIVO', 'BANCO', 'TARJETA', 'AHORRO'] },
          saldoInicial: { type: 'number', description: 'Saldo inicial, default 0' }
        },
        required: ['nombre', 'tipo']
      }
    }
  },
  // Recurrentes
  {
    type: 'function',
    function: {
      name: 'crear_recurrente',
      description: 'Crea una transacción recurrente (alquiler, suscripción, salario automático). "agrega un pago mensual de X por Y".',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          monto: { type: 'number' },
          tipo: { type: 'string', enum: ['GASTO', 'INGRESO'] },
          categoriaNombre: { type: 'string' },
          frecuencia: { type: 'string', enum: ['DIARIA', 'SEMANAL', 'MENSUAL', 'ANUAL'] }
        },
        required: ['nombre', 'monto', 'tipo', 'categoriaNombre', 'frecuencia']
      }
    }
  },
  // Alertas
  {
    type: 'function',
    function: {
      name: 'obtener_alertas',
      description: 'Lista alertas activas (presupuestos excedidos, metas completadas).',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
]

// ─── Tool executor ───────────────────────────────────────────────────────────

async function ejecutar(nombre: string, input: Record<string, unknown>, uid: string): Promise<string> {
  const ahora = new Date()
  const mes = (input.mes as number) || ahora.getMonth() + 1
  const anio = (input.anio as number) || ahora.getFullYear()

  // ── Crear transacción
  if (nombre === 'crear_transaccion') {
    const { monto, tipo, descripcion, categoriaNombre } = input as { monto: number; tipo: 'GASTO' | 'INGRESO'; descripcion?: string; categoriaNombre: string }
    const cat = await prisma.categoria.findFirst({ where: { usuarioId: uid, nombre: { contains: categoriaNombre, mode: 'insensitive' } } })
    if (!cat) {
      const all = await prisma.categoria.findMany({ where: { usuarioId: uid, tipo } })
      return `Categoría "${categoriaNombre}" no encontrada. Disponibles: ${all.map(c => c.nombre).join(', ')}`
    }
    await prisma.transaccion.create({ data: { monto, descripcion: descripcion ?? null, tipo, categoriaId: cat.id, usuarioId: uid, fecha: new Date() } })
    return `✅ ${tipo === 'GASTO' ? 'Gasto' : 'Ingreso'} de ${fmt(monto)} en ${cat.nombre} registrado.`
  }

  // ── Eliminar última transacción
  if (nombre === 'eliminar_ultima_transaccion') {
    const ultima = await prisma.transaccion.findFirst({ where: { usuarioId: uid }, orderBy: { createdAt: 'desc' }, include: { categoria: true } })
    if (!ultima) return 'No hay transacciones para eliminar.'
    await prisma.transaccion.delete({ where: { id: ultima.id } })
    if (ultima.cuentaId) {
      await prisma.cuenta.updateMany({
        where: { id: ultima.cuentaId, usuarioId: uid },
        data: ultima.tipo === 'INGRESO' ? { saldo: { decrement: ultima.monto } } : { saldo: { increment: ultima.monto } }
      })
    }
    return `🗑️ Eliminado: ${ultima.tipo === 'GASTO' ? 'Gasto' : 'Ingreso'} de ${fmt(ultima.monto)} en ${ultima.categoria.nombre}.`
  }

  // ── Transacciones recientes
  if (nombre === 'obtener_transacciones_recientes') {
    const limite = Math.min((input.limite as number) || 5, 20)
    const ts = await prisma.transaccion.findMany({ where: { usuarioId: uid }, include: { categoria: true }, orderBy: { fecha: 'desc' }, take: limite })
    if (!ts.length) return 'Sin transacciones.'
    return ts.map(t => {
      const f = new Date(t.fecha).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })
      return `${f} · ${t.tipo === 'INGRESO' ? '+' : '-'}${fmt(t.monto)} · ${t.categoria.nombre}${t.descripcion ? ` (${t.descripcion})` : ''}`
    }).join('\n')
  }

  // ── Resumen
  if (nombre === 'obtener_resumen') {
    const ini = new Date(anio, mes - 1, 1), fin = new Date(anio, mes, 0, 23, 59, 59)
    const [i, g] = await Promise.all([
      prisma.transaccion.aggregate({ where: { usuarioId: uid, tipo: 'INGRESO', fecha: { gte: ini, lte: fin } }, _sum: { monto: true } }),
      prisma.transaccion.aggregate({ where: { usuarioId: uid, tipo: 'GASTO', fecha: { gte: ini, lte: fin } }, _sum: { monto: true } })
    ])
    const ing = i._sum.monto ?? 0, gas = g._sum.monto ?? 0
    return `Resumen ${mes}/${anio}: Ingresos ${fmt(ing)}, Gastos ${fmt(gas)}, Balance ${fmt(ing - gas)} (${ing >= gas ? 'positivo ✅' : 'negativo ⚠️'})`
  }

  // ── Gastos por categoría
  if (nombre === 'obtener_gastos_categoria') {
    const ini = new Date(anio, mes - 1, 1), fin = new Date(anio, mes, 0, 23, 59, 59)
    const rows = await prisma.transaccion.groupBy({ by: ['categoriaId'], where: { usuarioId: uid, tipo: 'GASTO', fecha: { gte: ini, lte: fin } }, _sum: { monto: true }, orderBy: { _sum: { monto: 'desc' } } })
    if (!rows.length) return `Sin gastos en ${mes}/${anio}.`
    const lines = await Promise.all(rows.map(async r => {
      const c = await prisma.categoria.findUnique({ where: { id: r.categoriaId } })
      return `${c?.nombre}: ${fmt(r._sum.monto ?? 0)}`
    }))
    return `Gastos por categoría (${mes}/${anio}):\n${lines.join('\n')}`
  }

  // ── Obtener presupuestos
  if (nombre === 'obtener_presupuestos') {
    const ps = await prisma.presupuesto.findMany({ where: { usuarioId: uid, mes, anio }, include: { categoria: true } })
    if (!ps.length) return `Sin presupuestos en ${mes}/${anio}.`
    const ini = new Date(anio, mes - 1, 1), fin = new Date(anio, mes, 0, 23, 59, 59)
    const lines = await Promise.all(ps.map(async p => {
      const g = await prisma.transaccion.aggregate({ where: { usuarioId: uid, categoriaId: p.categoriaId, tipo: 'GASTO', fecha: { gte: ini, lte: fin } }, _sum: { monto: true } })
      const gastado = g._sum.monto ?? 0, pct = Math.round((gastado / p.limite) * 100)
      return `${p.categoria.nombre}: ${fmt(gastado)} / ${fmt(p.limite)} (${pct}%) ${pct >= 100 ? '⚠️ EXCEDIDO' : pct >= 80 ? '⚠️ cerca' : '✅'}`
    }))
    return `Presupuestos ${mes}/${anio}:\n${lines.join('\n')}`
  }

  // ── Crear presupuesto
  if (nombre === 'crear_presupuesto') {
    const { categoriaNombre, limite } = input as { categoriaNombre: string; limite: number }
    const cat = await prisma.categoria.findFirst({ where: { usuarioId: uid, nombre: { contains: categoriaNombre, mode: 'insensitive' }, tipo: 'GASTO' } })
    if (!cat) return `Categoría de gasto "${categoriaNombre}" no encontrada.`
    await prisma.presupuesto.upsert({
      where: { usuarioId_categoriaId_mes_anio: { usuarioId: uid, categoriaId: cat.id, mes, anio } },
      create: { limite, mes, anio, categoriaId: cat.id, usuarioId: uid },
      update: { limite }
    })
    return `✅ Presupuesto de ${fmt(limite)} para ${cat.nombre} en ${mes}/${anio} configurado.`
  }

  // ── Eliminar presupuesto
  if (nombre === 'eliminar_presupuesto') {
    const { categoriaNombre } = input as { categoriaNombre: string }
    const cat = await prisma.categoria.findFirst({ where: { usuarioId: uid, nombre: { contains: categoriaNombre, mode: 'insensitive' } } })
    if (!cat) return `Categoría "${categoriaNombre}" no encontrada.`
    const del = await prisma.presupuesto.deleteMany({ where: { usuarioId: uid, categoriaId: cat.id, mes, anio } })
    return del.count ? `🗑️ Presupuesto de ${cat.nombre} eliminado.` : 'No había presupuesto para esa categoría.'
  }

  // ── Obtener metas
  if (nombre === 'obtener_metas') {
    const metas = await prisma.meta.findMany({ where: { usuarioId: uid } })
    if (!metas.length) return 'Sin metas de ahorro.'
    return metas.map(m => {
      const pct = Math.round((m.montoActual / m.montoObjetivo) * 100)
      const fecha = m.fechaLimite ? ` · Límite: ${new Date(m.fechaLimite).toLocaleDateString('es-HN')}` : ''
      return `${m.nombre}: ${fmt(m.montoActual)} / ${fmt(m.montoObjetivo)} (${pct}%)${fecha}${m.completada ? ' ✅' : ''}`
    }).join('\n')
  }

  // ── Crear meta
  if (nombre === 'crear_meta') {
    const { nombre, objetivo, fechaLimite } = input as { nombre: string; objetivo: number; fechaLimite?: string }
    await prisma.meta.create({
      data: { nombre, montoObjetivo: objetivo, fechaLimite: fechaLimite ? new Date(fechaLimite) : null, usuarioId: uid, color: '#10b981' }
    })
    return `✅ Meta "${nombre}" creada con objetivo de ${fmt(objetivo)}.`
  }

  // ── Aportar a meta
  if (nombre === 'aportar_meta') {
    const { nombreMeta, monto } = input as { nombreMeta: string; monto: number }
    const meta = await prisma.meta.findFirst({ where: { usuarioId: uid, nombre: { contains: nombreMeta, mode: 'insensitive' } } })
    if (!meta) return `Meta "${nombreMeta}" no encontrada.`
    const nuevo = Math.min(meta.montoActual + monto, meta.montoObjetivo)
    const completada = nuevo >= meta.montoObjetivo
    await prisma.meta.update({ where: { id: meta.id }, data: { montoActual: nuevo, completada } })
    const pct = Math.round((nuevo / meta.montoObjetivo) * 100)
    return `✅ ${fmt(monto)} aportados a "${meta.nombre}". Progreso: ${fmt(nuevo)} / ${fmt(meta.montoObjetivo)} (${pct}%)${completada ? ' 🎉 ¡META COMPLETADA!' : ''}`
  }

  // ── Eliminar meta
  if (nombre === 'eliminar_meta') {
    const { nombreMeta } = input as { nombreMeta: string }
    const meta = await prisma.meta.findFirst({ where: { usuarioId: uid, nombre: { contains: nombreMeta, mode: 'insensitive' } } })
    if (!meta) return `Meta "${nombreMeta}" no encontrada.`
    await prisma.meta.delete({ where: { id: meta.id } })
    return `🗑️ Meta "${meta.nombre}" eliminada.`
  }

  // ── Obtener cuentas
  if (nombre === 'obtener_cuentas') {
    const cuentas = await prisma.cuenta.findMany({ where: { usuarioId: uid }, orderBy: { createdAt: 'asc' } })
    if (!cuentas.length) return 'Sin cuentas registradas.'
    const patrimonio = cuentas.reduce((s, c) => s + c.saldo, 0)
    const lines = cuentas.map(c => `${c.nombre} (${c.tipo}): ${fmt(c.saldo)}`)
    return `Cuentas:\n${lines.join('\n')}\n\nPatrimonio total: ${fmt(patrimonio)}`
  }

  // ── Crear cuenta
  if (nombre === 'crear_cuenta') {
    const { nombre, tipo, saldoInicial } = input as { nombre: string; tipo: 'EFECTIVO' | 'BANCO' | 'TARJETA' | 'AHORRO'; saldoInicial?: number }
    await prisma.cuenta.create({ data: { nombre, tipo, saldo: saldoInicial ?? 0, usuarioId: uid } })
    return `✅ Cuenta "${nombre}" (${tipo}) creada con saldo inicial ${fmt(saldoInicial ?? 0)}.`
  }

  // ── Crear recurrente
  if (nombre === 'crear_recurrente') {
    const { nombre, monto, tipo, categoriaNombre, frecuencia } = input as { nombre: string; monto: number; tipo: 'GASTO' | 'INGRESO'; categoriaNombre: string; frecuencia: 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'ANUAL' }
    const cat = await prisma.categoria.findFirst({ where: { usuarioId: uid, nombre: { contains: categoriaNombre, mode: 'insensitive' } } })
    if (!cat) return `Categoría "${categoriaNombre}" no encontrada.`
    const proxima = new Date()
    if (frecuencia === 'MENSUAL') proxima.setMonth(proxima.getMonth() + 1)
    else if (frecuencia === 'SEMANAL') proxima.setDate(proxima.getDate() + 7)
    else if (frecuencia === 'ANUAL') proxima.setFullYear(proxima.getFullYear() + 1)
    else proxima.setDate(proxima.getDate() + 1)
    await prisma.transaccionRecurrente.create({ data: { nombre, monto, tipo, categoriaId: cat.id, frecuencia, proximaFecha: proxima, usuarioId: uid } })
    const FREQ: Record<string, string> = { DIARIA: 'diaria', SEMANAL: 'semanal', MENSUAL: 'mensual', ANUAL: 'anual' }
    return `✅ Recurrente "${nombre}" de ${fmt(monto)} (${FREQ[frecuencia]}) creado.`
  }

  // ── Alertas
  if (nombre === 'obtener_alertas') {
    const alertas = await prisma.alerta.findMany({ where: { usuarioId: uid, leida: false }, orderBy: { createdAt: 'desc' }, take: 10 })
    if (!alertas.length) return 'Sin alertas activas. ✅'
    return `Alertas sin leer:\n${alertas.map(a => `• ${a.mensaje}`).join('\n')}`
  }

  return 'Herramienta no reconocida.'
}

// ─── Chat loop ───────────────────────────────────────────────────────────────

async function procesarChat(mensajes: Msg[], uid: string, nombreUsuario: string): Promise<string> {
  const groq = getGroq()
  const ahora = new Date()
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

  const system: Msg = {
    role: 'system',
    content: `Eres FinIA, asistente financiero personal integrado en la app de ${nombreUsuario}.
Fecha: ${ahora.getDate()} de ${MESES[ahora.getMonth()]} de ${ahora.getFullYear()}. Moneda: Lempiras (HNL, L).

CAPACIDADES (usa las herramientas disponibles):
• Registrar gastos e ingresos al instante
• Eliminar la última transacción si el usuario se equivocó
• Crear y consultar presupuestos por categoría
• Gestionar metas de ahorro (crear, aportar, eliminar)
• Consultar y crear cuentas (efectivo, banco, tarjeta, ahorro)
• Crear transacciones recurrentes (alquiler, suscripciones, salario)
• Ver alertas activas de presupuestos excedidos
• Consultar resúmenes mensuales y gastos por categoría

REGLAS:
- Cuando el usuario mencione gasto/ingreso → crear_transaccion inmediatamente, sin pedir confirmación
- Cuando diga "me equivoqué" / "deshaz" / "borra eso" → eliminar_ultima_transaccion
- Consulta los datos antes de responder preguntas sobre finanzas
- Responde en español, máximo 1-2 oraciones muy cortas, sin explicaciones innecesarias
- Confirma brevemente cada acción ejecutada
- Si el usuario pide algo que no tienes herramienta → explica qué sí puedes hacer`
  }

  const historial: Msg[] = [system, ...mensajes.slice(-12)]

  let response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: historial,
    tools: TOOLS,
    tool_choice: 'auto',
    max_tokens: 600,
    temperature: 0.3,
  })

  let iter = 0
  while (response.choices[0].finish_reason === 'tool_calls' && iter < 6) {
    iter++
    const msg = response.choices[0].message
    historial.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls } as Groq.Chat.ChatCompletionAssistantMessageParam)

    for (const call of msg.tool_calls ?? []) {
      let args: Record<string, unknown> = {}
      try {
        const p = JSON.parse(call.function.arguments)
        if (p && typeof p === 'object') args = p
      } catch { /* empty */ }
      const resultado = await ejecutar(call.function.name, args, uid)
      historial.push({ role: 'tool', content: resultado, tool_call_id: call.id } as Groq.Chat.ChatCompletionToolMessageParam)
    }

    response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: historial,
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: 600,
      temperature: 0.3,
    })
  }

  return response.choices[0].message.content ?? 'Sin respuesta.'
}

// ─── Controllers ─────────────────────────────────────────────────────────────

export const chat = async (req: AuthRequest, res: Response): Promise<void> => {
  const { mensajes } = req.body as { mensajes: Msg[] }
  if (!mensajes?.length) { res.status(400).json({ error: 'Se requiere mensajes' }); return }
  const mensajesLimpios: Msg[] = mensajes
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String((m as { content?: unknown }).content ?? '').slice(0, 2000) } as Msg))
    .slice(-12)
  const u = await prisma.usuario.findUnique({ where: { id: req.usuarioId! }, select: { nombre: true } })
  const respuesta = await procesarChat(mensajesLimpios, req.usuarioId!, u?.nombre ?? 'usuario')
  res.json({ respuesta })
}

export const chatVoz = async (req: Request & { usuarioId?: string }, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'Se requiere audio' }); return }
  const groq = getGroq()

  let historial: Msg[] = []
  try {
    const raw = (req.body as Record<string, string>).historial
    if (raw) historial = JSON.parse(raw)
  } catch { /* no historial */ }

  const audioFile = new File([req.file.buffer], 'audio.m4a', { type: req.file.mimetype || 'audio/m4a' })
  const transcripcion = await groq.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-large-v3-turbo',
    language: 'es',
    response_format: 'text'
  }) as unknown as string

  if (!transcripcion?.trim()) {
    res.json({ transcripcion: '', respuesta: 'No entendí el audio, intenta de nuevo.' })
    return
  }

  const u = await prisma.usuario.findUnique({ where: { id: req.usuarioId! }, select: { nombre: true } })
  const mensajesConVoz: Msg[] = [...historial, { role: 'user', content: transcripcion }]
  const respuesta = await procesarChat(mensajesConVoz, req.usuarioId!, u?.nombre ?? 'usuario')

  res.json({ transcripcion: transcripcion.trim(), respuesta })
}
