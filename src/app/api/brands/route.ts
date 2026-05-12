import { NextResponse } from 'next/server'
import { getBrands } from '@/parser/parser.brands'

export async function GET() {
  try {
    const data = await getBrands()
    return NextResponse.json({ status: true, data })
  } catch (err: any) {
    return NextResponse.json({ status: false, error: err.message || 'Failed' }, { status: 500 })
  }
}
