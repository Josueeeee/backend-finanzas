import { Router } from 'express'
import { obtenerAlertas, marcarLeida, marcarTodasLeidas } from '../controllers/alertaController'
import { verificarToken } from '../middleware/auth'
const router = Router()
router.use(verificarToken)
router.get('/', obtenerAlertas)
router.put('/:id/leer', marcarLeida)
router.put('/leer-todas', marcarTodasLeidas)
export default router
