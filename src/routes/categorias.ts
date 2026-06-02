import { Router } from 'express'
import { obtenerCategorias, crearCategoria, actualizarCategoria, eliminarCategoria } from '../controllers/categoriaController'
import { verificarToken } from '../middleware/auth'
const router = Router()
router.use(verificarToken)
router.get('/', obtenerCategorias)
router.post('/', crearCategoria)
router.put('/:id', actualizarCategoria)
router.delete('/:id', eliminarCategoria)
export default router
