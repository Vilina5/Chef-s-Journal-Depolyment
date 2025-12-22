/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // 确保包含所有使用 Tailwind 类的文件（路径要精准）
    "./src/**/*.{js,ts,jsx,tsx}", 
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sage: { 50: '#f0f4f1', 100: '#d9e2d5', 500: '#7a9e7e', 900: '#2d3e36' },
        terracotta: { 500: '#e76f51', 600: '#c95d42' },
      },
      // 确保没有覆盖 fontFamily（如果要自定义，需保留 sans 变体）
      fontFamily: {
        sans: ['system-ui', 'sans-serif'], // 显式定义 sans 字体族（可选）
      },
    },
  },
  plugins: [],
}