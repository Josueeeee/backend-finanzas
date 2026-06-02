import { Router } from 'express'
import { obtenerPresupuestos, crearPresupuesto, eliminarPresupuesto, copiarPresupuesto } from '../controllers/presupuestoController'
import { verificarToken } from '../middleware/auth'
const router = Router()
router.use(verificarToken)
router.get('/', obtenerPresupuestos)
router.post('/', crearPresupuesto)
router.post('/copiar', copiarPresupuesto)
router.delete('/:id', eliminarPresupuesto)
export default router
