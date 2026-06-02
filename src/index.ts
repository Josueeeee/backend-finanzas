import 'dotenv/config'
import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import compression from 'compression'
import { env } from './config/env'
import authRoutes from './routes/auth'
import transaccionesRoutes from './routes/transacciones'
import categoriasRoutes from './routes/categorias'
import presupuestosRoutes from './routes/presupuestos'
import metasRoutes from './routes/metas'
import reportesRoutes from './routes/reportes'
import alertasRoutes from './routes/alertas'
import cuentasRoutes from './routes/cuentas'
import recurrentesRoutes from './routes/recurrentes'
import chatRoutes from './routes/chat'

const app = express()

app.use(helmet())
app.use(compression())
app.use(cors({
  origin: (origin, cb) => {
    // Mobile apps don't send Origin header — allow them
    if (!origin || origin === env.frontendUrl) cb(null, true)
    else cb(new Error('Not allowed by CORS'))
  }
}))
app.use(express.json({ limit: '10mb' }))

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos, intenta en 15 minutos' },
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/transacciones', transaccionesRoutes)
app.use('/api/categorias', categoriasRoutes)
app.use('/api/presupuestos', presupuestosRoutes)
app.use('/api/metas', metasRoutes)
app.use('/api/reportes', reportesRoutes)
app.use('/api/alertas', alertasRoutes)
app.use('/api/cuentas', cuentasRoutes)
app.use('/api/recurrentes', recurrentesRoutes)
app.use('/api/chat', chatRoutes)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Error interno del servidor' })
})

app.listen(env.port, () => {
  console.log(`Servidor corriendo en puerto ${env.port}`)
})
