@echo off
rem 启动现有构建产物（不重建；如需重新构建请先运行 npm run build）
chcp 65001 > nul
npx electron-vite preview --skipBuild
