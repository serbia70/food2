@echo off
echo 正在上传文件到GitHub…
git add .
git commit -m "Sync at %date:/=-% %time% by %username%"
git push
echo 上传完成！
pause