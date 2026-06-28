import './globals.css';

export const metadata = {
  title: 'Mesh Schedule Overlay',
  description: 'A 9:16 schedule overlay renderer for Mesh social assets.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
