import { NextRequest, NextResponse } from 'next/server'
import { getPhoneDetails } from '@/parser/parser.phone-details'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  try {
    const data = await getPhoneDetails(slug)
    return NextResponse.json({ status: true, data })
  } catch (err: any) {
    return NextResponse.json(
      { status: false, error: err?.message ?? 'Failed to fetch phone details' },
      { status: 500 },
    )
  }
}
