import { Router } from 'express'
import { listarRecurrentes, crearRecurrente, toggleActiva, eliminarRecurrente, procesarRecurrentes } from '../controllers/recurrenteController'
import { verificarToken } from '../middleware/auth'

const router = Router()
router.use(verificarToken)
router.get('/', listarRecurrentes)
router.post('/', crearRecurrente)
router.post('/procesar', procesarRecurrentes)
router.put('/:id/toggle', toggleActiva)
router.delete('/:id', eliminarRecurrente)
export default router
