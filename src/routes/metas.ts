import { Router } from 'express'
import { obtenerMetas, crearMeta, aportarMeta, eliminarMeta } from '../controllers/metaController'
import { verificarToken } from '../middleware/auth'
const router = Router()
router.use(verificarToken)
router.get('/', obtenerMetas)
router.post('/', crearMeta)
router.post('/:id/aportar', aportarMeta)
router.delete('/:id', eliminarMeta)
export default router
