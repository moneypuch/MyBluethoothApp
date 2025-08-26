@echo off
echo Clearing React Native cache completely...

:: Stop Metro if running
taskkill /f /im node.exe 2>nul

:: Clear Metro cache
npx metro --reset-cache

:: Clear npm cache  
npm cache clean --force

:: Clear Expo cache
npx expo r -c

:: Clear React Native cache
cd android
if exist "build" rmdir /s /q build
cd app
if exist "build" rmdir /s /q build
cd ../..

:: Clear node_modules cache
if exist "node_modules/.cache" rmdir /s /q node_modules/.cache

echo Cache cleared! Try running the app now.
pause