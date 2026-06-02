export async function enviarPush(token: string, titulo: string, cuerpo: string): Promise<void> {
  if (!token || !token.startsWith('ExponentPushToken')) return
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({ to: token, title: titulo, body: cuerpo, sound: 'default' }),
    })
  } catch {
    // Push failures no deben romper el request
  }
}
