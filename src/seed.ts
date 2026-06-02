import { PrismaClient, TipoTransaccion, TipoCuenta, Frecuencia } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Limpiando datos existentes del usuario demo...')

  const existing = await prisma.usuario.findUnique({ where: { email: 'demo@finanzas.com' } })
  if (existing) {
    await prisma.usuario.delete({ where: { id: existing.id } })
  }

  console.log('Creando usuario demo...')
  const hash = await bcrypt.hash('demo1234', 10)
  const usuario = await prisma.usuario.create({
    data: {
      nombre: 'Usuario Demo',
      email: 'demo@finanzas.com',
      password: hash,
      moneda: 'HNL',
    },
  })

  // ──────────────── CATEGORÍAS ────────────────
  const cats = await prisma.categoria.createManyAndReturn({
    data: [
      { nombre: 'Alimentación',    color: '#ef4444', icono: 'utensils',      tipo: 'GASTO',   usuarioId: usuario.id },
      { nombre: 'Transporte',      color: '#f97316', icono: 'car',           tipo: 'GASTO',   usuarioId: usuario.id },
      { nombre: 'Servicios',       color: '#eab308', icono: 'zap',           tipo: 'GASTO',   usuarioId: usuario.id },
      { nombre: 'Salud',           color: '#22c55e', icono: 'heart-pulse',   tipo: 'GASTO',   usuarioId: usuario.id },
      { nombre: 'Entretenimiento', color: '#8b5cf6', icono: 'tv',            tipo: 'GASTO',   usuarioId: usuario.id },
      { nombre: 'Ropa',            color: '#ec4899', icono: 'shirt',         tipo: 'GASTO',   usuarioId: usuario.id },
      { nombre: 'Educación',       color: '#06b6d4', icono: 'book-open',     tipo: 'GASTO',   usuarioId: usuario.id },
      { nombre: 'Otros gastos',    color: '#6b7280', icono: 'circle',        tipo: 'GASTO',   usuarioId: usuario.id },
      { nombre: 'Salario',         color: '#10b981', icono: 'briefcase',     tipo: 'INGRESO', usuarioId: usuario.id },
      { nombre: 'Freelance',       color: '#3b82f6', icono: 'laptop',        tipo: 'INGRESO', usuarioId: usuario.id },
      { nombre: 'Otros ingresos',  color: '#a855f7', icono: 'trending-up',   tipo: 'INGRESO', usuarioId: usuario.id },
    ],
  })

  const byNombre = Object.fromEntries(cats.map(c => [c.nombre, c]))

  // ──────────────── CUENTAS ────────────────
  const [cuentaBanco, cuentaEfectivo] = await Promise.all([
    prisma.cuenta.create({
      data: { nombre: 'Cuenta BAC', tipo: TipoCuenta.BANCO, saldo: 18500, color: '#3b82f6', usuarioId: usuario.id },
    }),
    prisma.cuenta.create({
      data: { nombre: 'Billetera', tipo: TipoCuenta.EFECTIVO, saldo: 1200, color: '#10b981', usuarioId: usuario.id },
    }),
  ])

  // ──────────────── TRANSACCIONES (últimos 2 meses) ────────────────
  const hoy = new Date()
  const mes = hoy.getMonth()       // 0-based
  const anio = hoy.getFullYear()

  const d = (offsetDias: number) => {
    const f = new Date(hoy)
    f.setDate(f.getDate() - offsetDias)
    return f
  }

  await prisma.transaccion.createMany({
    data: [
      // Ingresos
      { monto: 18000, descripcion: 'Salario mensual',         fecha: d(1),  tipo: TipoTransaccion.INGRESO, categoriaId: byNombre['Salario'].id,         cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 3500,  descripcion: 'Proyecto web freelance',  fecha: d(5),  tipo: TipoTransaccion.INGRESO, categoriaId: byNombre['Freelance'].id,        cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 800,   descripcion: 'Venta de artículos',      fecha: d(12), tipo: TipoTransaccion.INGRESO, categoriaId: byNombre['Otros ingresos'].id,   cuentaId: cuentaEfectivo.id, usuarioId: usuario.id },

      // Gastos este mes
      { monto: 450,   descripcion: 'Supermercado La Colonia',  fecha: d(2),  tipo: TipoTransaccion.GASTO, categoriaId: byNombre['Alimentación'].id,    cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 120,   descripcion: 'Almuerzo Pollo Campero',   fecha: d(3),  tipo: TipoTransaccion.GASTO, categoriaId: byNombre['Alimentación'].id,    cuentaId: cuentaEfectivo.id, usuarioId: usuario.id },
      { monto: 380,   descripcion: 'Gasolina',                 fecha: d(4),  tipo: TipoTransaccion.GASTO, categoriaId: byNombre['Transporte'].id,      cuentaId: cuentaEfectivo.id, usuarioId: usuario.id },
      { monto: 890,   descripcion: 'Electricidad ENEE',        fecha: d(6),  tipo: TipoTransaccion.GASTO, categoriaId: byNombre['Servicios'].id,       cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 299,   descripcion: 'Internet Tigo',            fecha: d(6),  tipo: TipoTransaccion.GASTO, categoriaId: byNombre['Servicios'].id,       cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 650,   descripcion: 'Médico general',           fecha: d(8),  tipo: TipoTransaccion.GASTO, categoriaId: byNombre['Salud'].id,           cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 180,   descripcion: 'Netflix + Spotify',        fecha: d(9),  tipo: TipoTransaccion.GASTO, categoriaId: byNombre['Entretenimiento'].id, cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 220,   descripcion: 'Cine con familia',         fecha: d(14), tipo: TipoTransaccion.GASTO, categoriaId: byNombre['Entretenimiento'].id, cuentaId: cuentaEfectivo.id, usuarioId: usuario.id },
      { monto: 1200,  descripcion: 'Ropa nueva',               fecha: d(10), tipo: TipoTransaccion.GASTO, categoriaId: byNombre['Ropa'].id,            cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 500,   descripcion: 'Curso de programación',    fecha: d(11), tipo: TipoTransaccion.GASTO, categoriaId: byNombre['Educación'].id,       cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 90,    descripcion: 'Taxi urbano',              fecha: d(13), tipo: TipoTransaccion.GASTO, categoriaId: byNombre['Transporte'].id,      cuentaId: cuentaEfectivo.id, usuarioId: usuario.id },

      // Mes anterior
      { monto: 18000, descripcion: 'Salario mensual',          fecha: d(32), tipo: TipoTransaccion.INGRESO, categoriaId: byNombre['Salario'].id,       cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 560,   descripcion: 'Supermercado',             fecha: d(33), tipo: TipoTransaccion.GASTO,   categoriaId: byNombre['Alimentación'].id,  cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 400,   descripcion: 'Gasolina',                 fecha: d(35), tipo: TipoTransaccion.GASTO,   categoriaId: byNombre['Transporte'].id,    cuentaId: cuentaEfectivo.id, usuarioId: usuario.id },
      { monto: 850,   descripcion: 'Electricidad ENEE',        fecha: d(37), tipo: TipoTransaccion.GASTO,   categoriaId: byNombre['Servicios'].id,     cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 299,   descripcion: 'Internet Tigo',            fecha: d(37), tipo: TipoTransaccion.GASTO,   categoriaId: byNombre['Servicios'].id,     cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
      { monto: 320,   descripcion: 'Farmacia',                 fecha: d(40), tipo: TipoTransaccion.GASTO,   categoriaId: byNombre['Salud'].id,         cuentaId: cuentaEfectivo.id, usuarioId: usuario.id },
      { monto: 150,   descripcion: 'Streaming',                fecha: d(40), tipo: TipoTransaccion.GASTO,   categoriaId: byNombre['Entretenimiento'].id, cuentaId: cuentaBanco.id,  usuarioId: usuario.id },
      { monto: 2500,  descripcion: 'Freelance diseño',         fecha: d(45), tipo: TipoTransaccion.INGRESO, categoriaId: byNombre['Freelance'].id,     cuentaId: cuentaBanco.id,    usuarioId: usuario.id },
    ],
  })

  // ──────────────── PRESUPUESTOS (mes actual) ────────────────
  await prisma.presupuesto.createMany({
    data: [
      { limite: 1500, mes: mes + 1, anio, usuarioId: usuario.id, categoriaId: byNombre['Alimentación'].id },
      { limite: 600,  mes: mes + 1, anio, usuarioId: usuario.id, categoriaId: byNombre['Transporte'].id },
      { limite: 1200, mes: mes + 1, anio, usuarioId: usuario.id, categoriaId: byNombre['Servicios'].id },
      { limite: 400,  mes: mes + 1, anio, usuarioId: usuario.id, categoriaId: byNombre['Entretenimiento'].id },
      { limite: 800,  mes: mes + 1, anio, usuarioId: usuario.id, categoriaId: byNombre['Salud'].id },
    ],
  })

  // ──────────────── METAS ────────────────
  const fechaMeta1 = new Date(anio, mes + 6, 1)
  const fechaMeta2 = new Date(anio + 1, 0, 1)

  await prisma.meta.createMany({
    data: [
      { nombre: 'Fondo de emergencia', montoObjetivo: 30000, montoActual: 8500,  color: '#f97316', fechaLimite: fechaMeta1, usuarioId: usuario.id },
      { nombre: 'Vacaciones Roatán',   montoObjetivo: 15000, montoActual: 3200,  color: '#3b82f6', fechaLimite: fechaMeta2, usuarioId: usuario.id },
      { nombre: 'Laptop nueva',        montoObjetivo: 25000, montoActual: 12000, color: '#8b5cf6', usuarioId: usuario.id },
    ],
  })

  // ──────────────── RECURRENTES ────────────────
  const proxMes = new Date(anio, mes + 1, 1)
  const proxSemana = new Date(hoy)
  proxSemana.setDate(proxSemana.getDate() + (7 - proxSemana.getDay()))

  await prisma.transaccionRecurrente.createMany({
    data: [
      {
        nombre: 'Salario',
        monto: 18000,
        tipo: TipoTransaccion.INGRESO,
        categoriaId: byNombre['Salario'].id,
        cuentaId: cuentaBanco.id,
        frecuencia: Frecuencia.MENSUAL,
        proximaFecha: proxMes,
        usuarioId: usuario.id,
      },
      {
        nombre: 'Internet Tigo',
        monto: 299,
        tipo: TipoTransaccion.GASTO,
        categoriaId: byNombre['Servicios'].id,
        cuentaId: cuentaBanco.id,
        frecuencia: Frecuencia.MENSUAL,
        proximaFecha: proxMes,
        usuarioId: usuario.id,
      },
      {
        nombre: 'Netflix + Spotify',
        monto: 180,
        tipo: TipoTransaccion.GASTO,
        categoriaId: byNombre['Entretenimiento'].id,
        cuentaId: cuentaBanco.id,
        frecuencia: Frecuencia.MENSUAL,
        proximaFecha: proxMes,
        usuarioId: usuario.id,
      },
    ],
  })

  console.log('✓ Seed completo')
  console.log('  Email:    demo@finanzas.com')
  console.log('  Password: demo1234')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
