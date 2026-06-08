import { Router } from 'express'
import { registro, login, refresh, logout, perfil, actualizarPerfil, guardarPushToken } from '../controllers/authController'
import { verificarToken } from '../middleware/auth'

const router = Router()
router.post('/registro', registro)
router.post('/login', login)
router.post('/refresh', refresh)
router.post('/logout', verificarToken, logout)
router.get('/perfil', verificarToken, perfil)
router.put('/perfil', verificarToken, actualizarPerfil)
router.put('/push-token', verificarToken, guardarPushToken)
export default router
