// src/app/layout.tsx
import type { Metadata } from 'next';
// 🔴 核心：引入 Tailwind 全局样式（解决 CSS 不生效）
import './globals.css';

// 1. 全局元数据（改为中文，适配你的项目）
export const metadata: Metadata = {
  title: '家庭美食日记', // 浏览器标签页标题
  description: 'AI 辅助的家庭菜谱记录工具，生成专属美食教程', // 更贴合业务的描述
  icons: {
    icon: '/favicon.ico', // 可选：加网站图标（放在 public 目录）
  },
};

// 2. 根布局组件（无多余空白符，解决水合错误）
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 改语言为中文 + 加 Tailwind 全局类（比如防止页面溢出）
    <html lang="zh-CN" className="scroll-smooth">
      {/* 加全局 body 样式（浅背景色，解决 CSS 不生效） */}
      <body className="bg-sage-50 min-h-screen">
        {/* 🟢 子页面内容：登录页/菜谱页等 */}
        <main className="pb-16"> {/* 给底部导航留空间 */}
          {children}
        </main>
      </body>
    </html>
  );
}