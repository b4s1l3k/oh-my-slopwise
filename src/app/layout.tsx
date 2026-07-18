import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"

const inter = Inter({ subsets: ["latin", "cyrillic"] })

export const metadata: Metadata = {
  title: "Splitwise Personal",
  description: "Учёт совместных расходов",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
