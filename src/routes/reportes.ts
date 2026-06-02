import { Router } from 'express'
import { resumenMes, gastosPorCategoria, gastosPorCategoriaAnio, tendenciaMensual } from '../controllers/reporteController'
import { verificarToken } from '../middleware/auth'
const router = Router()
router.use(verificarToken)
router.get('/resumen', resumenMes)
router.get('/por-categoria', gastosPorCategoria)
router.get('/categoria-anio', gastosPorCategoriaAnio)
router.get('/tendencia', tendenciaMensual)
export default router
