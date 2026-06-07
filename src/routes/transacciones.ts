import { Router } from 'express'
import { obtenerTransacciones, crearTransaccion, actualizarTransaccion, eliminarTransaccion } from '../controllers/transaccionController'
import { importarImagen, uploadImagen } from '../controllers/importarImagenController'
import { verificarToken } from '../middleware/auth'
const router = Router()
router.use(verificarToken)
router.get('/', obtenerTransacciones)
router.post('/importar-imagen', uploadImagen.single('imagen'), importarImagen)
router.post('/', crearTransaccion)
router.put('/:id', actualizarTransaccion)
router.delete('/:id', eliminarTransaccion)
export default router
