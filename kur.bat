@echo off
chcp 65001
echo Gerekli kurulumlar yapılıyor. Lütfen bu yükleyicinin kapanmasını bekleyin!
npm install
echo Kurulum tamamlandı. Yükleyici kapanıyor!
timeout /t 2 > nul