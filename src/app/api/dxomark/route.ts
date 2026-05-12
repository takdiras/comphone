import { NextRequest, NextResponse } from 'next/server'
import { getDxoScores } from '@/parser/parser.dxomark'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name) {
    return NextResponse.json({ status: false, error: 'Missing ?name= parameter' }, { status: 400 })
  }
  try {
    const data = await getDxoScores(name)
    if (!data) return NextResponse.json({ status: false, error: 'Not found' }, { status: 404 })
    return NextResponse.json({ status: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: false, error: message }, { status: 500 })
  }
}
