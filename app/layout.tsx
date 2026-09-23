import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Sana — задачи для команд",
  description: "Конструктор бизнес-задач, рейтинг готовности и открытый выбор команд.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}


