import { NextRequest, NextResponse } from 'next/server'
import { ParserService } from '@/parser/parser.service'

const parser = new ParserService()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  try {
    const data = await parser.getPhonesByBrand(slug)
    return NextResponse.json({ status: true, data })
  } catch (err: any) {
    return NextResponse.json({ status: false, error: err.message || 'Failed' }, { status: 500 })
  }
}
