import { Router } from 'express'
import { verificarToken } from '../middleware/auth'
import { chat, chatVoz, upload } from '../controllers/chatController'

const router = Router()
router.post('/', verificarToken, chat)
router.post('/voz', verificarToken, upload.single('audio'), chatVoz)

export default router
