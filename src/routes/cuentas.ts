import { Router } from 'express'
import { listarCuentas, crearCuenta, actualizarCuenta, eliminarCuenta } from '../controllers/cuentaController'
import { verificarToken } from '../middleware/auth'

const router = Router()
router.use(verificarToken)
router.get('/', listarCuentas)
router.post('/', crearCuenta)
router.put('/:id', actualizarCuenta)
router.delete('/:id', eliminarCuenta)
export default router
