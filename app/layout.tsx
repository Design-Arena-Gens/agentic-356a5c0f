import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Chat Saxo - G?n?rateur de Vid?o",
  description: "Cr?ez une vid?o d'un chat qui joue du saxophone",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
