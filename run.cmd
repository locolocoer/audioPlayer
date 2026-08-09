@echo off
rem 启动生产构建（自动执行 electron-vite build 后再运行）
chcp 65001 > nul
npx electron-vite preview
