import { NextResponse } from 'next/server'
import { ParserService } from '@/parser/parser.service'

const parser = new ParserService()

export async function GET() {
  try {
    const data = await parser.getLatestPhones()
    return NextResponse.json({ status: true, data })
  } catch (err: any) {
    return NextResponse.json({ status: false, error: err.message || 'Failed' }, { status: 500 })
  }
}
