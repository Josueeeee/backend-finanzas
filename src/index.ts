import 'dotenv/config'
import { app } from './app'
import { env } from './config/env'
import { logger } from './lib/logger'

app.listen(env.port, () => {
  logger.info(`Servidor corriendo en puerto ${env.port}`)
})
