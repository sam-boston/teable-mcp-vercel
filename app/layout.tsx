export const metadata = {
  title: "Teable MCP",
  description: "MCP server on Vercel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
<html lang="en">
<body>{children}</body>
</html>
  );
}
