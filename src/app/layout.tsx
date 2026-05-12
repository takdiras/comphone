import type { Metadata } from 'next'
import './globals.css'
import { Prompt } from "next/font/google";
import { cn } from "@/lib/utils";
import Link from 'next/link';
import { GitCompareArrows, Building2 } from 'lucide-react';

const prompt = Prompt({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Comphone',
  description: 'Search smartphone specs powered by GSMArena',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark font-sans", prompt.variable)}>
      <body className="min-h-screen antialiased">
        <nav className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 h-13 flex items-center justify-between">
            <Link href="/" className="text-base tracking-tight">
              <span className="font-black italic text-foreground">Comphone</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/brands"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Building2 className="w-4 h-4" />
                Brands
              </Link>
              <Link
                href="/compare"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <GitCompareArrows className="w-4 h-4" />
                Compare
              </Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}
