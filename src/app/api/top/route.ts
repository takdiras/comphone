import { NextRequest, NextResponse } from 'next/server'
import { ParserService } from '@/parser/parser.service'

const parser = new ParserService()

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'interest'
  try {
    const data = type === 'fans'
      ? await parser.getTopByFans()
      : await parser.getTopByInterest()
    return NextResponse.json({ status: true, data })
  } catch (err: any) {
    return NextResponse.json({ status: false, error: err.message || 'Failed' }, { status: 500 })
  }
}
